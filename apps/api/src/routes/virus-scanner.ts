import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { virusScanner } from "../lib/virus-scanner";
import { authenticate, requireAdmin } from "../middleware/auth";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "@/lib/logger";

const virusScannerRoutes = new Hono();

// Apply authentication middleware - admin required for all routes
virusScannerRoutes.use("*", authenticate);

// Schema for updating quarantine settings
const quarantineConfigSchema = z.object({
  enabled: z.boolean().optional(),
  quarantineDirectory: z.string().optional(),
  maxScanSize: z.number().optional(),
});

/**
 * GET /virus-scanner/status
 * Get virus scanner status and configuration
 */
virusScannerRoutes.get("/status", async (c) => {
  try {
    const status = await virusScanner.getStatus();

    // Check quarantine directory
    const quarantineDir = "./quarantine";
    let quarantineStats = { files: 0, totalSize: 0 };

    try {
      const files = await fs.readdir(quarantineDir);
      const metadataFiles = files.filter((file) => file.endsWith(".meta.json"));

      let totalSize = 0;
      for (const file of files) {
        if (!file.endsWith(".meta.json")) {
          try {
            const filePath = path.join(quarantineDir, file);
            const stats = await fs.stat(filePath);
            totalSize += stats.size;
          } catch {
            // Ignore errors accessing individual files
          }
        }
      }

      quarantineStats = {
        files: files.filter((file) => !file.endsWith(".meta.json")).length,
        totalSize,
      };
    } catch {
      // Quarantine directory doesn't exist or is inaccessible
      quarantineStats = { files: 0, totalSize: 0 };
    }

    return c.json({
      success: true,
      data: {
        scanner: status,
        quarantine: {
          directory: quarantineDir,
          ...quarantineStats,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching virus scanner status", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch virus scanner status",
      },
      500,
    );
  }
});

/**
 * GET /virus-scanner/quarantine
 * List quarantined files
 */
virusScannerRoutes.get("/quarantine", async (c) => {
  try {
    const quarantineDir = "./quarantine";
    const files = await fs.readdir(quarantineDir);

    const quarantinedFiles = [];
    const metadataFiles = files.filter((file) => file.endsWith(".meta.json"));

    for (const metaFile of metadataFiles) {
      try {
        const metaPath = path.join(quarantineDir, metaFile);
        const metadataContent = await fs.readFile(metaPath, "utf-8");
        const metadata = JSON.parse(metadataContent);

        // Get file size
        const filePath = path.join(
          quarantineDir,
          metaFile.replace(".meta.json", ""),
        );
        let fileSize = 0;
        try {
          const stats = await fs.stat(filePath);
          fileSize = stats.size;
        } catch {
          // File might not exist
        }

        quarantinedFiles.push({
          id: metaFile.replace(".meta.json", ""),
          originalName: metadata.originalName,
          uploadTime: metadata.uploadTime,
          size: fileSize,
          threatLevel: metadata.scanResult?.threatLevel || "unknown",
          issues: metadata.scanResult?.issues || [],
          virusScan: metadata.virusScanResult
            ? {
                infected: metadata.virusScanResult.infected,
                threats: metadata.virusScanResult.threats,
                engine: metadata.virusScanResult.engine,
                scanTime: metadata.virusScanResult.scanTime,
              }
            : null,
          ip: metadata.ip,
          userAgent: metadata.userAgent,
        });
      } catch (error) {
        logger.error("Error reading metadata file", "virus-scanner", {
          file: metaFile,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // Sort by upload time (newest first)
    quarantinedFiles.sort(
      (a, b) =>
        new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime(),
    );

    return c.json({
      success: true,
      data: {
        files: quarantinedFiles,
        total: quarantinedFiles.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error listing quarantined files", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to list quarantined files",
      },
      500,
    );
  }
});

/**
 * GET /virus-scanner/quarantine/:fileId
 * Get details of a specific quarantined file
 */
virusScannerRoutes.get("/quarantine/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const quarantineDir = "./quarantine";
    const metaPath = path.join(quarantineDir, `${fileId}.meta.json`);

    try {
      const metadataContent = await fs.readFile(metaPath, "utf-8");
      const metadata = JSON.parse(metadataContent);

      // Check if file still exists
      const filePath = path.join(quarantineDir, fileId);
      let fileExists = false;
      let fileSize = 0;

      try {
        const stats = await fs.stat(filePath);
        fileExists = true;
        fileSize = stats.size;
      } catch {
        fileExists = false;
      }

      return c.json({
        success: true,
        data: {
          ...metadata,
          id: fileId,
          fileExists,
          currentSize: fileSize,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        return c.json(
          {
            success: false,
            error: "Quarantined file not found",
          },
          404,
        );
      }
      return c.json(
        {
          success: false,
          error: "Failed to access quarantined file",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  } catch (error) {
    logger.error("Error fetching quarantined file details", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch quarantined file details",
      },
      500,
    );
  }
});

/**
 * DELETE /virus-scanner/quarantine/:fileId
 * Delete a quarantined file (permanent deletion)
 */
virusScannerRoutes.delete("/quarantine/:fileId", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const quarantineDir = "./quarantine";
    const filePath = path.join(quarantineDir, fileId);
    const metaPath = path.join(quarantineDir, `${fileId}.meta.json`);

    // Delete both the file and its metadata
    const deletePromises = [fs.unlink(metaPath)];

    try {
      deletePromises.push(fs.unlink(filePath));
    } catch {
      // File might not exist, but we still try to delete metadata
    }

    await Promise.all(deletePromises);

    return c.json({
      success: true,
      message: `Quarantined file ${fileId} has been permanently deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error deleting quarantined file", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to delete quarantined file",
      },
      500,
    );
  }
});

/**
 * POST /virus-scanner/quarantine/:fileId/restore
 * Restore a quarantined file (move to regular uploads)
 */
virusScannerRoutes.post("/quarantine/:fileId/restore", async (c) => {
  try {
    const fileId = c.req.param("fileId");
    const quarantineDir = "./quarantine";
    const filePath = path.join(quarantineDir, fileId);
    const metaPath = path.join(quarantineDir, `${fileId}.meta.json`);

    // Read metadata to get original name
    const metadataContent = await fs.readFile(metaPath, "utf-8");
    const metadata = JSON.parse(metadataContent);

    // Create uploads directory if it doesn't exist
    const uploadsDir = "./uploads";
    await fs.mkdir(uploadsDir, { recursive: true });

    // Move file to uploads directory
    const restoredPath = path.join(uploadsDir, metadata.originalName);
    await fs.rename(filePath, restoredPath);

    // Delete metadata file
    await fs.unlink(metaPath);

    return c.json({
      success: true,
      message: `File ${metadata.originalName} has been restored from quarantine`,
      data: {
        originalName: metadata.originalName,
        restoredPath,
        originalQuarantineId: fileId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error restoring quarantined file", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to restore quarantined file",
      },
      500,
    );
  }
});

/**
 * POST /virus-scanner/quarantine/cleanup
 * Clean up old quarantined files
 */
virusScannerRoutes.post("/quarantine/cleanup", async (c) => {
  try {
    const body = await c.req.parseBody();
    const olderThanDays = parseInt(body.olderThanDays as string) || 30;

    const quarantineDir = "./quarantine";
    const files = await fs.readdir(quarantineDir);
    const metadataFiles = files.filter((file) => file.endsWith(".meta.json"));

    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    );
    let deletedCount = 0;
    let totalSizeFreed = 0;

    for (const metaFile of metadataFiles) {
      try {
        const metaPath = path.join(quarantineDir, metaFile);
        const metadataContent = await fs.readFile(metaPath, "utf-8");
        const metadata = JSON.parse(metadataContent);

        const uploadDate = new Date(metadata.uploadTime);
        if (uploadDate < cutoffDate) {
          const fileId = metaFile.replace(".meta.json", "");
          const filePath = path.join(quarantineDir, fileId);

          // Get file size before deletion
          try {
            const stats = await fs.stat(filePath);
            totalSizeFreed += stats.size;
          } catch {
            // File might not exist
          }

          // Delete both file and metadata
          await Promise.all([
            fs.unlink(metaPath).catch(() => {}), // Ignore errors
            fs.unlink(filePath).catch(() => {}), // Ignore errors
          ]);

          deletedCount++;
        }
      } catch (error) {
        logger.error("Error processing metadata file", "virus-scanner", {
          file: metaFile,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} quarantined files older than ${olderThanDays} days`,
      data: {
        deletedFiles: deletedCount,
        totalSizeFreed,
        olderThanDays,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error cleaning up quarantine", "virus-scanner", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to clean up quarantine",
      },
      500,
    );
  }
});

export { virusScannerRoutes };
