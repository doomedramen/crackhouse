import { logger } from "@/lib/logger";
import { storageManager } from "@/lib/storage-manager";
import { env } from "@/config/env";

interface CleanupJobData {
  triggeredBy?: "system" | "manual";
  retentionDays?: number;
  dryRun?: boolean;
}

export async function processStorageCleanup(data: CleanupJobData) {
  const { triggeredBy = "system", retentionDays, dryRun = false } = data;

  logger.info("Starting storage cleanup job", "storage-cleanup", {
    triggeredBy,
    retentionDays,
    dryRun,
  });

  try {
    // Check if auto-cleanup is enabled
    if (env.AUTO_CLEANUP_ENABLED !== "true" && triggeredBy === "system") {
      logger.info("Auto cleanup is disabled, skipping", "storage-cleanup");
      return {
        success: true,
        message: "Auto cleanup is disabled",
        deletedFiles: 0,
        freedSpace: 0,
      };
    }

    // Get system storage stats before cleanup
    const beforeStats = await storageManager.getStorageStats();
    const systemQuota = parseInt(env.SYSTEM_QUOTA_BYTES || "107374182400"); // 100GB
    const usagePercentage = (beforeStats.totalSize / systemQuota) * 100;

    logger.info("Storage stats before cleanup", "storage-cleanup", {
      totalSize: beforeStats.totalSize,
      totalFiles: beforeStats.totalFiles,
      usagePercentage,
      threshold: env.CLEANUP_THRESHOLD_PERCENT,
    });

    // Only perform cleanup if we're above threshold or it's manually triggered
    const threshold = parseInt(env.CLEANUP_THRESHOLD_PERCENT || "85");
    const shouldCleanup =
      usagePercentage >= threshold || triggeredBy === "manual";

    if (!shouldCleanup && triggeredBy === "system") {
      logger.info(
        "Storage usage below threshold, skipping cleanup",
        "storage-cleanup",
        {
          usagePercentage,
          threshold,
        },
      );

      return {
        success: true,
        message: "Storage usage below threshold",
        deletedFiles: 0,
        freedSpace: 0,
      };
    }

    // Perform cleanup
    const cleanupResult = await storageManager.performAutomaticCleanup();

    // Get stats after cleanup
    const afterStats = await storageManager.getStorageStats();
    const spaceFreed = beforeStats.totalSize - afterStats.totalSize;

    logger.info("Storage cleanup completed", "storage-cleanup", {
      deletedFiles: cleanupResult.deletedFiles,
      spaceFreed,
      errors: cleanupResult.errors.length,
      dryRun,
    });

    return {
      success: true,
      message: dryRun ? "Dry run completed" : "Cleanup completed successfully",
      deletedFiles: cleanupResult.deletedFiles,
      freedSpace: spaceFreed,
      errors: cleanupResult.errors,
      details: cleanupResult.details,
      beforeStats: {
        totalSize: beforeStats.totalSize,
        totalFiles: beforeStats.totalFiles,
        usagePercentage,
      },
      afterStats: {
        totalSize: afterStats.totalSize,
        totalFiles: afterStats.totalFiles,
        usagePercentage: (afterStats.totalSize / systemQuota) * 100,
      },
    };
  } catch (error) {
    logger.error("Storage cleanup job failed", "storage-cleanup", error);
    throw new Error(
      `Storage cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Export the function for BullMQ
export { processStorageCleanup as default };
