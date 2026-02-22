import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authenticate } from "@/middleware/auth";
import {
  storageManager,
  type StorageStats,
  type CleanupResult,
} from "@/lib/storage-manager";
import { logger } from "@/lib/logger";
import { env } from "@/config/env";

const app = new Hono();

// Apply authentication middleware to all routes
app.use("*", authenticate);

// Get storage statistics for current user
app.get("/stats", async (c) => {
  try {
    const user = c.get("user");
    const userId = user?.id;

    if (!userId) {
      return c.json({ error: "User not authenticated" }, 401);
    }

    // Get user quota info
    const quotaInfo = await storageManager.getUserQuotaInfo(userId);

    // Get overall storage stats
    const systemStats = await storageManager.getStorageStats();

    return c.json({
      success: true,
      data: {
        user: quotaInfo,
        system: {
          totalSize: systemStats.totalSize,
          totalFiles: systemStats.totalFiles,
          breakdown: systemStats.breakdown,
        },
      },
    });
  } catch (error) {
    logger.error("Failed to get storage stats", "storage", error);
    return c.json(
      {
        error: "Failed to retrieve storage statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Get detailed storage breakdown for current user
app.get("/usage", async (c) => {
  try {
    const user = c.get("user");
    const userId = user?.id;

    if (!userId) {
      return c.json({ error: "User not authenticated" }, 401);
    }

    const usage = await storageManager.getUserStorageUsage(userId);
    const quotaInfo = await storageManager.getUserQuotaInfo(userId);

    return c.json({
      success: true,
      data: {
        usage,
        quota: quotaInfo,
      },
    });
  } catch (error) {
    logger.error("Failed to get storage usage", "storage", error);
    return c.json(
      {
        error: "Failed to retrieve storage usage",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Check if user can upload a file of given size
app.post(
  "/check-quota",
  zValidator(
    "json",
    z.object({
      fileSize: z.number().min(0),
      fileName: z.string().min(1),
      fileType: z.enum(["pcap", "dictionary", "other"]),
    }),
  ),
  async (c) => {
    try {
      const user = c.get("user");
      const userId = user?.id;
      const { fileSize, fileName, fileType } = c.req.valid("json");

      if (!userId) {
        return c.json({ error: "User not authenticated" }, 401);
      }

      // Check user quota
      const canUpload = await storageManager.checkUserQuota(userId, fileSize);
      const quotaInfo = await storageManager.getUserQuotaInfo(userId);

      if (!canUpload) {
        return c.json(
          {
            success: false,
            error: "QUOTA_EXCEEDED",
            message: "Storage quota exceeded",
            data: {
              quota: quotaInfo,
              requestedSize: fileSize,
            },
          },
          413,
        );
      }

      return c.json({
        success: true,
        message: "Upload allowed",
        data: {
          quota: quotaInfo,
          requestedSize: fileSize,
          remainingAfterUpload: quotaInfo.available - fileSize,
        },
      });
    } catch (error) {
      logger.error("Failed to check quota", "storage", error);
      return c.json(
        {
          error: "Failed to check storage quota",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// Get system-wide storage statistics (admin only)
app.get("/system-stats", async (c) => {
  try {
    const user = c.get("user");

    // Check if user is admin or superuser
    if (!["admin", "superuser"].includes(user?.role || "")) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const stats = await storageManager.getStorageStats();
    const systemQuota = parseInt(env.SYSTEM_QUOTA_BYTES);

    return c.json({
      success: true,
      data: {
        ...stats,
        systemQuota,
        systemUsagePercentage: (stats.totalSize / systemQuota) * 100,
        isNearCapacity: stats.totalSize / systemQuota > 0.85,
      },
    });
  } catch (error) {
    logger.error("Failed to get system storage stats", "storage", error);
    return c.json(
      {
        error: "Failed to retrieve system storage statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Perform manual cleanup (admin only)
app.post(
  "/cleanup",
  zValidator(
    "json",
    z.object({
      dryRun: z.boolean().default(false),
      retentionDays: z.number().min(1).max(365).optional(),
    }),
  ),
  async (c) => {
    try {
      const user = c.get("user");

      // Check if user is admin or superuser
      if (!["admin", "superuser"].includes(user?.role || "")) {
        return c.json({ error: "Admin access required" }, 403);
      }

      const { dryRun, retentionDays } = c.req.valid("json");

      logger.info("Manual storage cleanup requested", "storage", {
        userId: user.id,
        dryRun,
        retentionDays,
      });

      if (dryRun) {
        // Just return what would be cleaned up without actually deleting
        const stats = await storageManager.getStorageStats();
        return c.json({
          success: true,
          message: "Dry run completed - no files were deleted",
          data: {
            dryRun: true,
            potentialCleanup: {
              totalFiles: stats.totalFiles,
              totalSize: stats.totalSize,
              breakdown: stats.breakdown,
            },
          },
        });
      }

      // Perform actual cleanup
      const result = await storageManager.performAutomaticCleanup();

      return c.json({
        success: true,
        message: "Cleanup completed successfully",
        data: {
          ...result,
          performedBy: user.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to perform storage cleanup", "storage", error);
      return c.json(
        {
          error: "Failed to perform storage cleanup",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// Get storage quota information for all users (admin only)
app.get("/user-quotas", async (c) => {
  try {
    const user = c.get("user");

    // Check if user is admin or superuser
    if (!["admin", "superuser"].includes(user?.role || "")) {
      return c.json({ error: "Admin access required" }, 403);
    }

    const stats = await storageManager.getStorageStats();
    const userQuota = parseInt(env.USER_QUOTA_BYTES);

    // Transform user usage into quota information
    const userQuotas = Object.entries(stats.userUsage).map(
      ([userId, usage]) => ({
        userId,
        used: usage.size,
        quota: userQuota,
        available: Math.max(0, userQuota - usage.size),
        percentageUsed: Math.min(100, (usage.size / userQuota) * 100),
        files: usage.files,
        isOverQuota: usage.size > userQuota,
      }),
    );

    // Sort by usage (highest first)
    userQuotas.sort((a, b) => b.used - a.used);

    return c.json({
      success: true,
      data: {
        users: userQuotas,
        totalUsers: userQuotas.length,
        usersOverQuota: userQuotas.filter((u) => u.isOverQuota).length,
        averageUsage:
          userQuotas.length > 0
            ? userQuotas.reduce((sum, u) => sum + u.used, 0) / userQuotas.length
            : 0,
      },
    });
  } catch (error) {
    logger.error("Failed to get user quotas", "storage", error);
    return c.json(
      {
        error: "Failed to retrieve user quota information",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export { app as storageRoutes };
