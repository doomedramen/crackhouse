import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { dictionaries, networks, jobs } from "@/db/schema";
import { eq, and, lt, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { env } from "@/config/env";

export interface StorageStats {
  totalSize: number;
  totalFiles: number;
  userUsage: Record<string, { size: number; files: number }>;
  systemUsage: number;
  breakdown: {
    dictionaries: { size: number; files: number };
    pcap: { size: number; files: number };
    other: { size: number; files: number };
  };
}

export interface CleanupResult {
  deletedFiles: number;
  freedSpace: number;
  errors: string[];
  details: {
    dictionaries: { deleted: number; spaceFreed: number };
    networks: { deleted: number; spaceFreed: number };
    jobs: { deleted: number; spaceFreed: number };
  };
}

export class StorageManager {
  private uploadDir: string;

  constructor() {
    this.uploadDir = env.UPLOAD_DIR;
  }

  /**
   * Get comprehensive storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      // Ensure upload directory exists
      await fs.mkdir(this.uploadDir, { recursive: true });

      const stats = await this.scanDirectory(this.uploadDir);
      const dbStats = await this.getDatabaseStorageStats();

      return {
        totalSize: stats.totalSize,
        totalFiles: stats.totalFiles,
        userUsage: stats.userUsage,
        systemUsage: stats.totalSize,
        breakdown: {
          dictionaries: dbStats.dictionaries,
          pcap: dbStats.pcap,
          other: {
            size:
              stats.totalSize - dbStats.dictionaries.size - dbStats.pcap.size,
            files:
              stats.totalFiles -
              dbStats.dictionaries.files -
              dbStats.pcap.files,
          },
        },
      };
    } catch (error) {
      logger.error("Failed to get storage stats", "storage", error);
      throw new Error("Failed to calculate storage statistics");
    }
  }

  /**
   * Get user-specific storage usage
   */
  async getUserStorageUsage(
    userId: string,
  ): Promise<{ size: number; files: number }> {
    try {
      const [dictUsage, networkUsage] = await Promise.all([
        this.getUserDictionaryUsage(userId),
        this.getUserNetworkUsage(userId),
      ]);

      return {
        size: dictUsage.size + networkUsage.size,
        files: dictUsage.files + networkUsage.files,
      };
    } catch (error) {
      logger.error("Failed to get user storage usage", "storage", error, {
        userId,
      });
      return { size: 0, files: 0 };
    }
  }

  /**
   * Check if user is within quota
   */
  async checkUserQuota(
    userId: string,
    additionalSize: number = 0,
  ): Promise<boolean> {
    const userQuota = parseInt(env.USER_QUOTA_BYTES);
    const currentUsage = await this.getUserStorageUsage(userId);

    return currentUsage.size + additionalSize <= userQuota;
  }

  /**
   * Get storage quota information for user
   */
  async getUserQuotaInfo(userId: string): Promise<{
    used: number;
    quota: number;
    available: number;
    percentageUsed: number;
    isOverQuota: boolean;
  }> {
    const quota = parseInt(env.USER_QUOTA_BYTES);
    const usage = await this.getUserStorageUsage(userId);

    return {
      used: usage.size,
      quota,
      available: Math.max(0, quota - usage.size),
      percentageUsed: Math.min(100, (usage.size / quota) * 100),
      isOverQuota: usage.size > quota,
    };
  }

  /**
   * Perform automatic cleanup based on retention policies
   */
  async performAutomaticCleanup(): Promise<CleanupResult> {
    if (env.AUTO_CLEANUP_ENABLED !== "true") {
      return {
        deletedFiles: 0,
        freedSpace: 0,
        errors: ["Automatic cleanup is disabled"],
        details: {
          dictionaries: { deleted: 0, spaceFreed: 0 },
          networks: { deleted: 0, spaceFreed: 0 },
          jobs: { deleted: 0, spaceFreed: 0 },
        },
      };
    }

    const retentionDays = parseInt(env.FILE_RETENTION_DAYS);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info("Starting automatic cleanup", "storage", {
      cutoffDate,
      retentionDays,
    });

    try {
      const [dictCleanup, networkCleanup, jobCleanup] =
        await Promise.allSettled([
          this.cleanupOldDictionaries(cutoffDate),
          this.cleanupOldNetworks(cutoffDate),
          this.cleanupOldJobs(cutoffDate),
        ]);

      const result: CleanupResult = {
        deletedFiles: 0,
        freedSpace: 0,
        errors: [],
        details: {
          dictionaries: { deleted: 0, spaceFreed: 0 },
          networks: { deleted: 0, spaceFreed: 0 },
          jobs: { deleted: 0, spaceFreed: 0 },
        },
      };

      // Process dictionary cleanup results
      if (dictCleanup.status === "fulfilled") {
        result.details.dictionaries = dictCleanup.value;
        result.deletedFiles += dictCleanup.value.deleted;
        result.freedSpace += dictCleanup.value.spaceFreed;
      } else {
        result.errors.push(`Dictionary cleanup failed: ${dictCleanup.reason}`);
      }

      // Process network cleanup results
      if (networkCleanup.status === "fulfilled") {
        result.details.networks = networkCleanup.value;
        result.deletedFiles += networkCleanup.value.deleted;
        result.freedSpace += networkCleanup.value.spaceFreed;
      } else {
        result.errors.push(`Network cleanup failed: ${networkCleanup.reason}`);
      }

      // Process job cleanup results
      if (jobCleanup.status === "fulfilled") {
        result.details.jobs = jobCleanup.value;
        result.deletedFiles += jobCleanup.value.deleted;
        result.freedSpace += jobCleanup.value.spaceFreed;
      } else {
        result.errors.push(`Job cleanup failed: ${jobCleanup.reason}`);
      }

      logger.info("Automatic cleanup completed", "storage", {
        deletedFiles: result.deletedFiles,
        freedSpace: result.freedSpace,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error("Automatic cleanup failed", "storage", error);
      throw new Error("Failed to perform automatic cleanup");
    }
  }

  /**
   * Cleanup old dictionaries
   */
  private async cleanupOldDictionaries(
    cutoffDate: Date,
  ): Promise<{ deleted: number; spaceFreed: number }> {
    const oldDictionaries = await db
      .select()
      .from(dictionaries)
      .where(
        and(
          lt(dictionaries.createdAt, cutoffDate),
          eq(dictionaries.status, "ready"),
        ),
      );

    let deleted = 0;
    let spaceFreed = 0;

    for (const dict of oldDictionaries) {
      try {
        if (dict.filePath) {
          await fs.unlink(dict.filePath);
        }

        await db.delete(dictionaries).where(eq(dictionaries.id, dict.id));

        deleted++;
        spaceFreed += dict.size || 0;

        logger.debug("Deleted old dictionary", "storage", {
          id: dict.id,
          name: dict.name,
          size: dict.size,
        });
      } catch (error) {
        logger.error("Failed to delete dictionary", "storage", error, {
          id: dict.id,
          name: dict.name,
        });
      }
    }

    return { deleted, spaceFreed };
  }

  /**
   * Cleanup old networks
   */
  private async cleanupOldNetworks(
    cutoffDate: Date,
  ): Promise<{ deleted: number; spaceFreed: number }> {
    const oldNetworks = await db
      .select()
      .from(networks)
      .where(
        and(
          lt(networks.createdAt, cutoffDate),
          isNull(networks.userId), // Networks without user association (orphaned)
        ),
      );

    let deleted = 0;
    let spaceFreed = 0;

    for (const network of oldNetworks) {
      try {
        // Check if network has associated jobs
        const associatedJobs = await db
          .select()
          .from(jobs)
          .where(eq(jobs.networkId, network.id))
          .limit(1);

        if (associatedJobs.length === 0) {
          await db.delete(networks).where(eq(networks.id, network.id));
          deleted++;

          logger.debug("Deleted old network", "storage", {
            id: network.id,
            ssid: network.ssid,
          });
        }
      } catch (error) {
        logger.error("Failed to delete network", "storage", error, {
          id: network.id,
          ssid: network.ssid,
        });
      }
    }

    return { deleted, spaceFreed };
  }

  /**
   * Cleanup old jobs
   */
  private async cleanupOldJobs(
    cutoffDate: Date,
  ): Promise<{ deleted: number; spaceFreed: number }> {
    const oldJobs = await db
      .select()
      .from(jobs)
      .where(and(lt(jobs.createdAt, cutoffDate), eq(jobs.status, "completed")));

    let deleted = 0;
    let spaceFreed = 0;

    for (const job of oldJobs) {
      try {
        // Check if job has any results
        const resultCount = await db
          .select({ count: jobs.id })
          .from(jobs)
          .where(eq(jobs.id, job.id));

        if (resultCount.length === 0) {
          await db.delete(jobs).where(eq(jobs.id, job.id));
          deleted++;

          logger.debug("Deleted old job", "storage", {
            id: job.id,
            name: job.name,
          });
        }
      } catch (error) {
        logger.error("Failed to delete job", "storage", error, {
          id: job.id,
          name: job.name,
        });
      }
    }

    return { deleted, spaceFreed };
  }

  /**
   * Scan directory and calculate file sizes
   */
  private async scanDirectory(dirPath: string): Promise<{
    totalSize: number;
    totalFiles: number;
    userUsage: Record<string, { size: number; files: number }>;
  }> {
    const result = {
      totalSize: 0,
      totalFiles: 0,
      userUsage: {} as Record<string, { size: number; files: number }>,
    };

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subResult = await this.scanDirectory(fullPath);
          result.totalSize += subResult.totalSize;
          result.totalFiles += subResult.totalFiles;

          // Merge user usage
          for (const [userId, usage] of Object.entries(subResult.userUsage)) {
            if (!result.userUsage[userId]) {
              result.userUsage[userId] = { size: 0, files: 0 };
            }
            result.userUsage[userId].size += usage.size;
            result.userUsage[userId].files += usage.files;
          }
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          result.totalSize += stats.size;
          result.totalFiles += 1;

          // Extract user ID from filename pattern (user_id_hash.ext)
          const match = entry.name.match(/^([^_]+)/);
          if (match) {
            const userId = match[1];
            if (!result.userUsage[userId]) {
              result.userUsage[userId] = { size: 0, files: 0 };
            }
            result.userUsage[userId].size += stats.size;
            result.userUsage[userId].files += 1;
          }
        }
      }
    } catch (error) {
      logger.error("Failed to scan directory", "storage", error, { dirPath });
    }

    return result;
  }

  /**
   * Get storage statistics from database
   */
  private async getDatabaseStorageStats(): Promise<{
    dictionaries: { size: number; files: number };
    pcap: { size: number; files: number };
  }> {
    try {
      const [dictStats, networkStats] = await Promise.all([
        db
          .select({
            totalSize: dictionaries.size,
            count: dictionaries.id,
          })
          .from(dictionaries)
          .where(eq(dictionaries.status, "ready")),

        db
          .select({
            count: networks.id,
          })
          .from(networks),
      ]);

      return {
        dictionaries: {
          size: dictStats.reduce((sum, dict) => sum + (dict.totalSize || 0), 0),
          files: dictStats.length,
        },
        pcap: {
          size: 0, // Networks don't have file size in DB
          files: networkStats.length,
        },
      };
    } catch (error) {
      logger.error("Failed to get database storage stats", "storage", error);
      return {
        dictionaries: { size: 0, files: 0 },
        pcap: { size: 0, files: 0 },
      };
    }
  }

  /**
   * Get user dictionary usage
   */
  private async getUserDictionaryUsage(
    userId: string,
  ): Promise<{ size: number; files: number }> {
    try {
      const userDicts = await db
        .select({
          size: dictionaries.size,
        })
        .from(dictionaries)
        .where(
          and(
            eq(dictionaries.userId, userId),
            eq(dictionaries.status, "ready"),
          ),
        );

      return {
        size: userDicts.reduce((sum, dict) => sum + (dict.size || 0), 0),
        files: userDicts.length,
      };
    } catch (error) {
      logger.error("Failed to get user dictionary usage", "storage", error, {
        userId,
      });
      return { size: 0, files: 0 };
    }
  }

  /**
   * Get user network usage
   */
  private async getUserNetworkUsage(
    userId: string,
  ): Promise<{ size: number; files: number }> {
    try {
      const userNetworks = await db
        .select({
          count: networks.id,
        })
        .from(networks)
        .where(eq(networks.userId, userId));

      return {
        size: 0, // Networks don't have file size in DB
        files: userNetworks.length,
      };
    } catch (error) {
      logger.error("Failed to get user network usage", "storage", error, {
        userId,
      });
      return { size: 0, files: 0 };
    }
  }
}

// Export singleton instance
export const storageManager = new StorageManager();
