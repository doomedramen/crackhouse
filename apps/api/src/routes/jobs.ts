import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { jobs, selectJobSchema } from "@/db/schema";
import { eq, desc, asc, and, isNull, isNotNull, inArray } from "drizzle-orm";
import {
  createNotFoundError,
  createValidationError,
} from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { getHashcatJob, removeHashcatJob } from "@/lib/queue";
import { auditService } from "@/services/audit.service";
import { authenticate, getUserId } from "@/middleware/auth";
import { sql } from "drizzle-orm";

const jobManagementRoutes = new Hono();

// Apply authentication middleware to all routes
jobManagementRoutes.use("*", authenticate);

// Job update schema
const updateJobSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional(),
  progress: z.number().min(0).max(100).optional(),
  hashcatMode: z.number().optional(),
});

// 1. GET / - List all jobs
jobManagementRoutes.get("/", async (c) => {
  try {
    const userId = c.get("userId");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const status = c.req.query("status") as string;
    const offset = (page - 1) * limit;

    let whereConditions = [eq(jobs.userId, userId)];
    if (status) {
      whereConditions.push(eq(jobs.status, status));
    }

    const allJobs = await db.query.jobs.findMany({
      where:
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0],
      orderBy: [desc(jobs.createdAt)],
      with: {
        network: true,
        dictionary: true,
        results: true,
      },
      limit,
      offset,
    });

    const totalCount = await db.query.jobs.findMany({
      where:
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0],
    });

    const totalPages = Math.ceil(totalCount.length / limit);

    return c.json({
      success: true,
      data: allJobs,
      meta: {
        page,
        limit,
        total: totalCount.length,
        totalPages,
      },
    });
  } catch (error) {
    logger.error("get_jobs_error", "jobs", {
      error:
        error instanceof Error
          ? error.message
          : String(error || "Unknown error"),
      userId: c.get("userId"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get jobs",
      },
      500,
    );
  }
});

/**
 * GET /api/jobs/stats - Get job statistics
 */
jobManagementRoutes.get("/stats", async (c) => {
  try {
    const userId = c.get("userId");

    const userJobs = await db.query.jobs.findMany({
      where: eq(jobs.userId, userId),
      columns: {
        status: true,
      },
    });

    const stats = {
      total: userJobs.length,
      pending: userJobs.filter(
        (job) => job.status === "pending" || job.status === "scheduled",
      ).length,
      running: userJobs.filter((job) => job.status === "running").length,
      completed: userJobs.filter((job) => job.status === "completed").length,
      failed: userJobs.filter((job) => job.status === "failed").length,
      cancelled: userJobs.filter((job) => job.status === "cancelled").length,
      scheduled: userJobs.filter((job) => job.status === "scheduled").length,
    };

    logger.info("job_stats_retrieved", "jobs", {
      userId,
      ...stats,
    });

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("job_stats_error", "jobs", {
      error: error.message,
      userId: c.get("userId"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get job statistics",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * GET /api/jobs/scheduled - List scheduled jobs
 */
jobManagementRoutes.get("/scheduled", async (c) => {
  try {
    const userId = c.get("userId");
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "20");
    const offset = (page - 1) * limit;

    const [scheduledJobs, totalCountResult] = await Promise.all([
      db.query.jobs.findMany({
        where: and(
          eq(jobs.userId, userId),
          eq(jobs.status, "scheduled"),
          isNotNull(jobs.scheduledAt),
        ),
        orderBy: [asc(jobs.scheduledAt)],
        with: {
          network: true,
          dictionary: true,
        },
        limit,
        offset,
      }),
      db.query.jobs.findMany({
        where: and(eq(jobs.userId, userId), eq(jobs.status, "scheduled")),
      }),
    ]);

    const totalCount = totalCountResult.length;
    const totalPages = Math.ceil(totalCount / limit);

    logger.info("scheduled_jobs_retrieved", "jobs", {
      userId,
      page,
      limit,
      totalFound: totalCount,
    });

    return c.json({
      success: true,
      data: scheduledJobs,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
    });
  } catch (error) {
    logger.error("get_scheduled_jobs_error", "jobs", {
      error: error.message,
      userId: c.get("userId"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get scheduled jobs",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * GET /api/jobs/filter - Search and filter jobs
 */
jobManagementRoutes.get("/filter", async (c) => {
  try {
    const userId = c.get("userId");
    const {
      status,
      priority,
      tags,
      networkId,
      dictionaryId,
      search,
      page,
      limit,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = c.req.query();

    let whereConditions = [eq(jobs.userId, userId)];

    if (status) {
      whereConditions.push(eq(jobs.status, status));
    }

    if (priority) {
      whereConditions.push(eq(jobs.priority, priority));
    }

    if (tags && tags.length > 0) {
      const tagList = tags.split(",");
      // Check if any of the tags are in the job's tags array
      for (const tag of tagList) {
        whereConditions.push(
          sql`${jobs.tags} @> ${sql.raw(`'["${tag}"]'::jsonb`)}`,
        );
      }
    }

    if (networkId) {
      whereConditions.push(eq(jobs.networkId, networkId));
    }

    if (dictionaryId) {
      whereConditions.push(eq(jobs.dictionaryId, dictionaryId));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      whereConditions.push(sql`name ILIKE ${searchTerm}`);
    }

    const pageNum = parseInt(page || "1");
    const limitNum = parseInt(limit || "20");
    const offset = (pageNum - 1) * limitNum;

    const allJobs = await db.query.jobs.findMany({
      where:
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0],
      with: {
        network: true,
        dictionary: true,
        results: true,
      },
      limit: limitNum,
      offset,
    });

    const totalCountResult = await db.query.jobs.findMany({
      where:
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0],
    });

    const totalCount = totalCountResult.length;
    const totalPages = Math.ceil(totalCount / limitNum);

    logger.info("jobs_filtered", "jobs", {
      userId,
      filters: { status, priority, tags, networkId, dictionaryId, search },
      page: pageNum,
      limit: limitNum,
      totalFound: totalCount,
    });

    return c.json({
      success: true,
      data: allJobs,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages,
        filters: { status, priority, tags, networkId, dictionaryId, search },
      },
    });
  } catch (error) {
    logger.error("filter_jobs_error", "jobs", {
      error: error.message,
      userId: c.get("userId"),
      query: c.req.query(),
    });

    return c.json(
      {
        success: false,
        error: "Failed to filter jobs",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * GET /api/jobs/tags - Get all unique tags
 */
jobManagementRoutes.get("/tags", async (c) => {
  try {
    const userId = c.get("userId");

    const allJobs = await db.query.jobs.findMany({
      where: eq(jobs.userId, userId),
      columns: {
        tags: true,
      },
    });

    const allTags = new Set<string>();
    for (const job of allJobs) {
      if (job.tags) {
        for (const tag of job.tags) {
          allTags.add(tag);
        }
      }
    }

    const uniqueTags = Array.from(allTags).sort();

    logger.info("job_tags_retrieved", "jobs", {
      userId,
      totalJobs: allJobs.length,
      uniqueTags: uniqueTags.length,
    });

    return c.json({
      success: true,
      data: uniqueTags,
    });
  } catch (error) {
    logger.error("get_job_tags_error", "jobs", {
      error: error.message,
      userId: c.get("userId"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get job tags",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * POST /api/jobs/bulk-cancel - Cancel multiple jobs
 */
jobManagementRoutes.post(
  "/bulk-cancel",
  zValidator(
    "json",
    z.object({
      jobIds: z.array(z.string().uuid()).min(1).max(50),
    }),
  ),
  async (c) => {
    try {
      const userId = c.get("userId");
      const { jobIds } = c.req.valid("json");

      const jobsToCancel = await db.query.jobs.findMany({
        where: and(inArray(jobs.id, jobIds), eq(jobs.userId, userId)),
      });

      if (jobsToCancel.length === 0) {
        return c.json(
          {
            success: false,
            error: "No cancellable jobs found",
          },
          404,
        );
      }

      let results = [];

      for (const job of jobsToCancel) {
        const queueJobRemoved = job.status === "running";

        if (job.status === "running") {
          try {
            await removeHashcatJob(job.id);
            results.push({
              id: job.id,
              status: "cancellation_requested",
              message: "Cancellation request sent to worker",
            });
          } catch (workerError) {
            results.push({
              id: job.id,
              status: "error",
              error:
                workerError instanceof Error
                  ? workerError.message
                  : "Unknown error",
            });
          }
        } else if (["completed", "failed", "cancelled"].includes(job.status)) {
          results.push({
            id: job.id,
            status: "error",
            error: `Job is already ${job.status}`,
          });
        } else {
          await db
            .update(jobs)
            .set({
              status: "cancelled",
              cancelledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));

          results.push({
            id: job.id,
            status: "cancelled",
            message: "Job cancelled successfully",
          });

          if (job.networkId && job.status === "pending") {
            try {
              const { networks } = await import("@/db/schema");
              await db
                .update(networks)
                .set({
                  status: "ready",
                  updatedAt: new Date(),
                })
                .where(eq(networks.id, job.networkId));

              logger.info("network_status_reset", "jobs", {
                jobId: job.id,
                networkId: job.networkId,
              });
            } catch (networkError) {
              logger.error("failed_to_reset_network_status", "jobs", {
                jobId: job.id,
                networkId: job.networkId,
                error:
                  networkError instanceof Error
                    ? networkError
                    : new Error(String(networkError)),
              });
            }
          }
        }
      }

      logger.info("bulk_job_cancel", "jobs", {
        userId,
        totalRequested: jobIds.length,
        totalProcessed: jobsToCancel.length,
        cancelled: results.filter((r) => r.status === "cancelled").length,
      });

      return c.json({
        success: true,
        data: {
          results,
          summary: {
            totalRequested: jobIds.length,
            totalProcessed: jobsToCancel.length,
            cancelled: results.filter((r) => r.status === "cancelled").length,
            cancellationRequested: results.filter(
              (r) => r.status === "cancellation_requested",
            ).length,
            errors: results.filter((r) => r.status === "error").length,
          },
        },
      });
    } catch (error) {
      logger.error("bulk_cancel_job_error", "jobs", {
        error: error.message,
        userId: c.get("userId"),
      });

      return c.json(
        {
          success: false,
          error: "Failed to cancel jobs",
          message: error.message,
        },
        500,
      );
    }
  },
);

// Parameterized routes - must come after specific routes
jobManagementRoutes.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("userId");

    const existingJob = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
      with: {
        network: true,
        dictionary: true,
        results: true,
      },
    });

    if (!existingJob) {
      return c.json(
        {
          success: false,
          error: "Job not found",
        },
        404,
      );
    }

    if (existingJob.userId !== userId) {
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
      data: existingJob,
    });
  } catch (error) {
    logger.error("get_job_error", "jobs", {
      error: error.message,
      jobId: c.req.param("id"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get job",
      },
      500,
    );
  }
});

/**
 * POST /api/jobs/:id/cancel - Cancel a job
 */
jobManagementRoutes.post("/:id/cancel", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("userId");

    const existingJob = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, id), eq(jobs.userId, userId)),
    });

    if (!existingJob) {
      return c.json(
        {
          success: false,
          error: "Job not found",
        },
        404,
      );
    }

    if (existingJob.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    const queueJobRemoved = existingJob.status === "running";

    await auditService.logEvent({
      userId,
      action: "cancel_job",
      entityType: "job",
      entityId: id,
      success: true,
    });

    if (existingJob.status === "running") {
      try {
        await removeHashcatJob(id);
        logger.info("job_cancellation_requested_for_running_job", "jobs", {
          jobId: id,
          userId,
        });
      } catch (workerError) {
        logger.error("failed_to_cancel_running_job", "jobs", {
          jobId: id,
          userId,
          error:
            workerError instanceof Error
              ? workerError
              : new Error(String(workerError)),
        });

        return c.json(
          {
            success: false,
            error: "Failed to cancel running job",
            message:
              "Job is running, cancellation request sent but may take time to stop",
          },
          500,
        );
      }
    }

    await db
      .update(jobs)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));

    logger.info("job_cancelled", "jobs", {
      jobId: id,
      userId,
      previousStatus: existingJob.status,
      queueJobRemoved,
    });

    if (existingJob.networkId && existingJob.status === "pending") {
      try {
        const { networks } = await import("@/db/schema");
        await db
          .update(networks)
          .set({
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(networks.id, existingJob.networkId));

        logger.info("network_status_reset_after_job_cancellation", "jobs", {
          jobId: id,
          networkId: existingJob.networkId,
        });
      } catch (networkError) {
        logger.error("failed_to_reset_network_status", "jobs", {
          jobId: id,
          networkId: existingJob.networkId,
          error:
            networkError instanceof Error
              ? networkError
              : new Error(String(networkError)),
        });
      }
    }

    return c.json({
      success: true,
      data: {
        id: existingJob.id,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      },
      message: "Job cancelled successfully",
    });
  } catch (error) {
    logger.error("cancel_job_error", "jobs", {
      error: error.message,
      jobId: c.req.param("id"),
      userId: c.get("userId"),
    });

    await auditService.logEvent({
      userId: c.get("userId"),
      action: "cancel_job",
      entityType: "job",
      entityId: c.req.param("id"),
      success: false,
      details: { error: String(error) },
    });

    return c.json(
      {
        success: false,
        error: "Failed to cancel job",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * DELETE /api/jobs/:id - Delete a job
 */
jobManagementRoutes.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("userId");

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

    const queueJobRemoved = job.status === "running";

    await auditService.logEvent({
      userId,
      action: "delete_job",
      entityType: "job",
      entityId: id,
      success: true,
    });

    if (job.status === "running") {
      try {
        await removeHashcatJob(id);
        logger.info("job_deletion_requested_for_running_job", "jobs", {
          jobId: id,
          userId,
        });
      } catch (workerError) {
        logger.error("failed_to_delete_running_job", "jobs", {
          jobId: id,
          userId,
          error:
            workerError instanceof Error
              ? workerError
              : new Error(String(workerError)),
        });

        return c.json(
          {
            success: false,
            error: "Failed to delete running job",
            message:
              "Job is running, deletion request sent but may take time to stop",
          },
          500,
        );
      }
    }

    await db.delete(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));

    if (job.networkId && job.status === "pending") {
      try {
        const { networks } = await import("@/db/schema");
        await db
          .update(networks)
          .set({
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(networks.id, job.networkId));

        logger.info("network_status_reset_after_job_deletion", "jobs", {
          jobId: id,
          networkId: job.networkId,
        });
      } catch (networkError) {
        logger.error("failed_to_reset_network_status", "jobs", {
          jobId: id,
          networkId: job.networkId,
          error:
            networkError instanceof Error
              ? networkError
              : new Error(String(networkError)),
        });
      }
    }

    logger.info("job_deleted", "jobs", {
      jobId: id,
      userId,
      previousStatus: job.status,
      queueJobRemoved,
    });

    return c.json({
      success: true,
      data: {
        id: job.id,
        status: "deleted",
      },
      message: "Job deleted successfully",
    });
  } catch (error) {
    logger.error("delete_job_error", "jobs", {
      error: error.message,
      jobId: c.req.param("id"),
      userId: c.get("userId"),
    });

    await auditService.logEvent({
      userId: c.get("userId"),
      action: "delete_job",
      entityType: "job",
      entityId: c.req.param("id"),
      success: false,
      details: { error: String(error) },
    });

    return c.json(
      {
        success: false,
        error: "Failed to delete job",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * POST /api/jobs/:id/schedule - Schedule a job
 */
jobManagementRoutes.post(
  "/:id/schedule",
  zValidator(
    "json",
    z.object({
      scheduledAt: z.string().datetime().optional(),
      dependsOn: z.array(z.string().uuid()).optional(),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = c.get("userId");
      const { scheduledAt, dependsOn } = c.req.valid("json");

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

      if (
        ["running", "completed", "failed", "cancelled"].includes(job.status)
      ) {
        return c.json(
          {
            success: false,
            error: "Job cannot be scheduled",
            message: `Job is already ${job.status}`,
          },
          400,
        );
      }

      if (scheduledAt) {
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) {
          return c.json(
            {
              success: false,
              error: "Scheduled time must be in the future",
              message: "Scheduled time must be at least 1 minute from now",
            },
            400,
          );
        }
      }

      if (dependsOn && dependsOn.length > 0) {
        const depJobs = await db.query.jobs.findMany({
          where: inArray(jobs.id, dependsOn),
          columns: { id: true, status: true },
        });

        const incompleteDeps = depJobs.filter((j) => j.status !== "completed");
        if (incompleteDeps.length > 0) {
          return c.json(
            {
              success: false,
              error: "Dependencies not completed",
              message: "All dependencies must be completed before scheduling",
              incompleteDependencies: incompleteDeps.map((j) => ({
                id: j.id,
                status: j.status,
              })),
            },
            400,
          );
        }

        const checkCircular = (
          jobId: string,
          visited: Set<string> = new Set(),
        ): boolean => {
          if (visited.has(jobId)) {
            return true;
          }
          visited.add(jobId);

          const depJob = depJobs.find((j) => j.id === jobId);
          if (!depJob) return false;

          if (!depJob.dependsOn || depJob.dependsOn.length === 0) return false;

          return depJob.dependsOn.some((depId) =>
            checkCircular(depId, visited),
          );
        };

        if (checkCircular(id, new Set([id]))) {
          return c.json(
            {
              success: false,
              error: "Circular dependency detected",
              message: "Job dependencies create a circular reference",
            },
            400,
          );
        }
      }

      await db
        .update(jobs)
        .set({
          status: "scheduled",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          dependsOn: dependsOn || null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id));

      await auditService.logEvent({
        userId,
        action: "schedule_job",
        entityType: "job",
        entityId: id,
        success: true,
        details: { scheduledAt, dependsOn },
      });

      logger.info("job_scheduled", "jobs", {
        jobId: id,
        userId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        dependsOn,
      });

      return c.json({
        success: true,
        data: {
          id: job.id,
          status: "scheduled",
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          dependsOn,
        },
        message: "Job scheduled successfully",
      });
    } catch (error) {
      logger.error("schedule_job_error", "jobs", {
        error: error.message,
        jobId: c.req.param("id"),
        userId: c.get("userId"),
      });

      await auditService.logEvent({
        userId: c.get("userId"),
        action: "schedule_job",
        entityType: "job",
        entityId: c.req.param("id"),
        success: false,
        details: { error: String(error) },
      });

      return c.json(
        {
          success: false,
          error: "Failed to schedule job",
          message: error.message,
        },
        500,
      );
    }
  },
);

/**
 * GET /api/jobs/:id/dependencies - Get job dependencies
 */
jobManagementRoutes.get("/:id/dependencies", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("userId");

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

    let dependencies = [];

    if (job.dependsOn && job.dependsOn.length > 0) {
      const depJobs = await db.query.jobs.findMany({
        where: inArray(jobs.id, job.dependsOn),
        columns: {
          id: true,
          name: true,
          status: true,
          scheduledAt: true,
        },
      });

      dependencies = depJobs.map((depJob) => ({
        id: depJob.id,
        name: depJob.name,
        status: depJob.status,
        scheduledAt: depJob.scheduledAt
          ? new Date(depJob.scheduledAt).toISOString()
          : null,
        isCompleted: depJob.status === "completed",
      }));
    }

    const dependentJobs = await db.query.jobs.findMany({
      where: and(
        eq(jobs.userId, userId),
        isNotNull(jobs.dependsOn),
        // Use raw SQL to check if the dependsOn array contains the job id
        sql`(${jobs.dependsOn})::jsonb ? ${id}`,
      ),
      columns: {
        id: true,
        name: true,
        status: true,
      },
    });

    logger.info("job_dependencies_retrieved", "jobs", {
      jobId: id,
      dependenciesCount: dependencies.length,
      dependentCount: dependentJobs.length,
    });

    return c.json({
      success: true,
      data: {
        job: {
          id: job.id,
          name: job.name,
          dependsOn: job.dependsOn || null,
        },
        dependencies,
        dependents: dependentJobs,
      },
    });
  } catch (error) {
    logger.error("get_job_dependencies_error", "jobs", {
      error: error.message,
      jobId: c.req.param("id"),
      userId: c.get("userId"),
    });

    return c.json(
      {
        success: false,
        error: "Failed to get job dependencies",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * POST /api/jobs/:id/retry - Retry failed job
 */
jobManagementRoutes.post("/:id/retry", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = c.get("userId");

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

    if (!["failed", "cancelled"].includes(job.status)) {
      return c.json(
        {
          success: false,
          error: "Job cannot be retried",
          message: "Only failed or cancelled jobs can be retried",
        },
        400,
      );
    }

    await db
      .update(jobs)
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));

    if (job.networkId && job.status === "pending") {
      try {
        const { networks } = await import("@/db/schema");
        await db
          .update(networks)
          .set({
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(networks.id, job.networkId));

        logger.info("network_status_reset_after_job_retry", "jobs", {
          jobId: id,
          networkId: job.networkId,
        });
      } catch (networkError) {
        logger.error("failed_to_reset_network_status", "jobs", {
          jobId: id,
          networkId: job.networkId,
          error:
            networkError instanceof Error
              ? networkError
              : new Error(String(networkError)),
        });
      }
    }

    await auditService.logEvent({
      userId,
      action: "retry_job",
      entityType: "job",
      entityId: id,
      success: true,
    });

    logger.info("job_retried", "jobs", {
      jobId: id,
      userId,
      previousStatus: job.status,
    });

    return c.json({
      success: true,
      data: {
        id: job.id,
        status: "pending",
        message: "Job queued for retry",
      },
    });
  } catch (error) {
    logger.error("retry_job_error", "jobs", {
      error: error.message,
      jobId: c.req.param("id"),
      userId: c.get("userId"),
    });

    await auditService.logEvent({
      userId: c.get("userId"),
      action: "retry_job",
      entityType: "job",
      entityId: c.req.param("id"),
      success: false,
      details: { error: String(error) },
    });

    return c.json(
      {
        success: false,
        error: "Failed to retry job",
        message: error.message,
      },
      500,
    );
  }
});

/**
 * PATCH /api/jobs/:id/priority - Update job priority
 */
jobManagementRoutes.patch(
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
jobManagementRoutes.patch(
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

      await db
        .update(jobs)
        .set({
          tags,
          updatedAt: new Date(),
        })
        .where(and(eq(jobs.id, id), eq(jobs.userId, userId)));

      await auditService.logEvent({
        userId,
        action: "update_job_tags",
        entityType: "job",
        entityId: id,
        details: { oldTags: job.tags || [], newTags: tags },
        success: true,
      });

      logger.info("job_tags_updated", "jobs", {
        jobId: id,
        userId,
        oldTags: job.tags || [],
        newTags: tags,
      });

      return c.json({
        success: true,
        data: {
          id: job.id,
          tags,
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

export { jobManagementRoutes };
