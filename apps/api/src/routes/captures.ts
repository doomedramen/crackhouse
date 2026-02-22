import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import {
  authenticate,
  getUserId,
  isAdmin,
  requireAdmin,
} from "@/middleware/auth";
import { logger } from "@/lib/logger";
import { CapturesService } from "@/services/captures.service";
import { env } from "@/config/env";

const capturesRouter = new Hono();

// Use MAX_FILE_SIZE from env, convert to bytes (default 500MB)
const maxFileSize = () => {
  const sizeStr = env.MAX_FILE_SIZE || "500MB";
  const match = sizeStr.match(/^(\d+)(MB|GB|KB)?$/i);
  if (!match) return 524288000; // 500MB default
  const num = parseInt(match[1]);
  const unit = (match[2] || "B").toUpperCase();
  switch (unit) {
    case "KB":
      return num * 1024;
    case "MB":
      return num * 1024 * 1024;
    case "GB":
      return num * 1024 * 1024 * 1024;
    default:
      return num;
  }
};

const uploadSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => {
      return file.size <= maxFileSize();
    },
    {
      message: "File size must be less than configured maximum",
    },
  ),
  metadata: z.record(z.string()).optional(),
});

// Apply authentication to all routes
capturesRouter.use("*", authenticate);

/**
 * GET /api/v1/captures
 * List captures with filtering and pagination
 */
capturesRouter.get("/", async (c) => {
  try {
    const userId = getUserId(c);
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const status = c.req.query("status") as
      | "pending"
      | "processing"
      | "completed"
      | "failed"
      | undefined;
    const search = c.req.query("search");

    // Admins can see all captures, users only see their own
    if (isAdmin(c)) {
      const result = await CapturesService.list({
        status,
        page,
        limit,
        search,
      });
      return c.json(result);
    }

    // Regular users only see their own captures
    const result = await CapturesService.listUserCaptures(userId, {
      status,
      page,
      limit,
      search,
    });

    return c.json(result);
  } catch (error) {
    logger.error(
      "Get captures error",
      "captures",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch captures",
      },
      500,
    );
  }
});

/**
 * POST /api/v1/captures/upload
 * Upload a new PCAP file
 */
capturesRouter.post("/upload", zValidator("form", uploadSchema), async (c) => {
  try {
    const userId = getUserId(c);
    const { file, metadata } = c.req.valid("form");

    const capture = await CapturesService.create({
      filename: file.name,
      userId,
      fileSize: file.size,
      filePath: `/data/uploads/captures/${userId}/${file.name}`,
      metadata,
    });

    logger.info("Capture created", "captures", {
      captureId: capture.id,
      userId,
      filename: file.name,
      fileSize: file.size,
    });

    return c.json(
      {
        success: true,
        data: {
          id: capture.id,
          filename: capture.filename,
          fileSize: capture.fileSize,
          status: capture.status,
          uploadedAt: capture.uploadedAt,
        },
      },
      201,
    );
  } catch (error) {
    logger.error(
      "Upload capture error",
      "captures",
      error instanceof Error ? error : new Error(String(error)),
      {
        userId: getUserId(c),
        filename: c.req.valid("form")?.file?.name,
      },
    );

    return c.json(
      {
        success: false,
        error: "Failed to upload capture",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/captures/:id
 * Get capture details
 */
capturesRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = getUserId(c);
    const capture = await CapturesService.getById(id);

    if (!capture) {
      return c.json(
        {
          success: false,
          error: "Capture not found",
        },
        404,
      );
    }

    // Users can only view their own captures
    const userOwnsCapture = capture.userId === userId;
    const canView = userOwnsCapture || isAdmin(c);

    if (!canView) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    return c.json({
      success: true,
      data: capture,
    });
  } catch (error) {
    logger.error(
      "Get capture error",
      "captures",
      error instanceof Error ? error : new Error(String(error)),
      {
        captureId: c.req.param("id"),
      },
    );

    return c.json(
      {
        success: false,
        error: "Failed to fetch capture",
      },
      500,
    );
  }
});

/**
 * DELETE /api/v1/captures/:id
 * Delete a capture
 */
capturesRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = getUserId(c);
    const capture = await CapturesService.getById(id);

    if (!capture) {
      return c.json(
        {
          success: false,
          error: "Capture not found",
        },
        404,
      );
    }

    // Users can only delete their own captures
    const userOwnsCapture = capture.userId === userId;
    const canDelete = userOwnsCapture || isAdmin(c);

    if (!canDelete) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    await CapturesService.delete(id);

    logger.info("Capture deleted", "captures", {
      captureId: id,
      deletedBy: userId,
    });

    return c.json({
      success: true,
      message: "Capture deleted successfully",
    });
  } catch (error) {
    logger.error(
      "Delete capture error",
      "captures",
      error instanceof Error ? error : new Error(String(error)),
      {
        captureId: c.req.param("id"),
        userId: getUserId(c),
      },
    );

    return c.json(
      {
        success: false,
        error: "Failed to delete capture",
      },
      500,
    );
  }
});

export { capturesRouter as capturesRoutes };
