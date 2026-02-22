import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { auditService } from "@/services/audit.service";

const jobUpdateRoutes = new Hono();

jobUpdateRoutes.use("*", async (c, next) => {
  const userId = c.get("userId");
  c.set("userId", userId);
  await next();
});

/**
 * PATCH /api/jobs/:id/priority - Update job priority
 */
jobUpdateRoutes.patch(
  "/:id/priority",
  zValidator(
    "json",
    z.object({
      priority: z.enum(["low", "normal", "high", "critical"]),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = c.get("userId");
      const { priority } = c.req.valid("json");

      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, id), eq(jobs.userId, userId)),
        with: {
          network: true,
          dictionary: true,
        },
      });

      if (!job) {
        return c.json(
          {
            success: false,
            error: "Job not found",
          },
          404,
        );
      }

      if (job.userId !== userId) {
        return c.json(
          {
            success: false,
            error: "Access denied",
          },
          403,
        );
      }

      if (
        ["running", "completed", "failed", "cancelled"].includes(job.status)
      ) {
        return c.json(
          {
            success: false,
            error: "Job priority cannot be changed",
            message: `Job is already ${job.status}`,
          },
          400,
        );
      }

      await db
        .update(jobs)
        .set({
          priority,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));

      await auditService.logEvent({
        userId,
        action: "update_job_priority",
        entityType: "job",
        entityId: id,
        details: { oldPriority: job.priority, newPriority: priority },
        success: true,
      });

      logger.info("job_priority_updated", "jobs", {
        jobId: id,
        userId,
        oldPriority: job.priority,
        newPriority: priority,
      });

      return c.json({
        success: true,
        data: {
          id: job.id,
          priority,
        },
        message: "Job priority updated successfully",
      });
    } catch (error) {
      logger.error("update_job_priority_error", "jobs", {
        error: error.message,
        jobId: c.req.param("id"),
        userId: c.get("userId"),
      });

      await auditService.logEvent({
        userId: c.get("userId"),
        action: "update_job_priority",
        entityType: "job",
        entityId: c.req.param("id"),
        success: false,
        details: { error: String(error) },
      });

      return c.json(
        {
          success: false,
          error: "Failed to update job priority",
          message: error.message,
        },
        500,
      );
    }
  },
);

/**
 * PATCH /api/jobs/:id/tags - Update job tags
 */
jobUpdateRoutes.patch(
  "/:id/tags",
  zValidator(
    "json",
    z.object({
      tags: z.array(z.string().min(1).max(50)).max(10),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = c.get("userId");
      const { tags } = c.req.valid("json");

      const job = await db.query.jobs.findFirst({
        where: and(eq(jobs.id, id), eq(jobs.userId, userId)),
      });

      if (!job) {
        return c.json(
          {
            success: false,
            error: "Job not found",
          },
          404,
        );
      }

      if (job.userId !== userId) {
        return c.json(
          {
            success: false,
            error: "Access denied",
          },
          403,
        );
      }

      const normalizedTags = tags.map((tag) => tag.toLowerCase().trim());

      await db
        .update(jobs)
        .set({
          tags: normalizedTags,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));

      await auditService.logEvent({
        userId,
        action: "update_job_tags",
        entityType: "job",
        entityId: id,
        details: { oldTags: job.tags || [], newTags: normalizedTags },
        success: true,
      });

      logger.info("job_tags_updated", "jobs", {
        jobId: id,
        userId,
        oldTags: job.tags || [],
        newTags: normalizedTags,
      });

      return c.json({
        success: true,
        data: {
          id: job.id,
          tags: normalizedTags,
        },
        message: "Job tags updated successfully",
      });
    } catch (error) {
      logger.error("update_job_tags_error", "jobs", {
        error: error.message,
        jobId: c.req.param("id"),
        userId: c.get("userId"),
      });

      await auditService.logEvent({
        userId: c.get("userId"),
        action: "update_job_tags",
        entityType: "job",
        entityId: c.req.param("id"),
        success: false,
        details: { error: String(error) },
      });

      return c.json(
        {
          success: false,
          error: "Failed to update job tags",
          message: error.message,
        },
        500,
      );
    }
  },
);

export { jobUpdateRoutes };
