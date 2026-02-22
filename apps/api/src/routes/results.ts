import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { jobResults, jobs, networks } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { authMiddleware as authenticate, getUserId } from "@/middleware/auth";
import { logger } from "@/lib/logger";

const resultsRouter = new Hono();

// Apply authentication to all routes
resultsRouter.use("*", authenticate);

// Query parameter validation schema
const resultsQuerySchema = z.object({
  jobId: z.string().uuid().optional(),
  networkId: z.string().uuid().optional(),
  type: z.enum(["password", "handshake", "error"]).optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val))
    .default("50"),
  offset: z
    .string()
    .transform((val) => parseInt(val))
    .default("0"),
});

// IMPORTANT: Route order matters! Specific routes must be defined BEFORE parameterized routes.

// GET /api/results/stats - Get statistics about results (MUST be before /:id)
resultsRouter.get("/stats", async (c) => {
  const userId = getUserId(c);

  try {
    // Count results by type
    const resultsByType = await db
      .select({
        type: jobResults.type,
        count: sql`count(*)`.mapWith(Number),
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .where(eq(jobs.userId, userId))
      .groupBy(jobResults.type);

    // Count unique networks with cracked passwords
    const [{ crackedNetworks }] = await db
      .select({
        crackedNetworks: sql`count(DISTINCT ${jobs.networkId})`.mapWith(Number),
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .where(and(eq(jobs.userId, userId), eq(jobResults.type, "password")));

    // Total networks
    const [{ totalNetworks }] = await db
      .select({
        totalNetworks: sql`count(*)`.mapWith(Number),
      })
      .from(networks)
      .where(eq(networks.userId, userId));

    logger.info("Results stats fetched", "results", {
      userId,
      resultsByType,
      crackedNetworks,
      totalNetworks,
    });

    return c.json({
      success: true,
      data: {
        byType: resultsByType.reduce(
          (acc, { type, count }) => {
            acc[type] = count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        crackedNetworks,
        totalNetworks,
        crackRate:
          totalNetworks > 0 ? (crackedNetworks / totalNetworks) * 100 : 0,
      },
    });
  } catch (error) {
    logger.error(
      "Get results stats error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch results statistics",
      },
      500,
    );
  }
});

// GET /api/results/passwords/cracked - Get only cracked passwords (MUST be before /:id)
resultsRouter.get("/passwords/cracked", async (c) => {
  const userId = getUserId(c);

  try {
    const crackedPasswords = await db
      .select({
        id: jobResults.id,
        jobId: jobResults.jobId,
        type: jobResults.type,
        data: jobResults.data,
        createdAt: jobResults.createdAt,
        network: {
          id: networks.id,
          ssid: networks.ssid,
          bssid: networks.bssid,
          encryption: networks.encryption,
        },
        job: {
          id: jobs.id,
          name: jobs.name,
        },
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .innerJoin(networks, eq(jobs.networkId, networks.id))
      .where(and(eq(jobs.userId, userId), eq(jobResults.type, "password")))
      .orderBy(desc(jobResults.createdAt));

    logger.info("Cracked passwords fetched", "results", {
      userId,
      count: crackedPasswords.length,
    });

    return c.json({
      success: true,
      data: crackedPasswords,
      count: crackedPasswords.length,
    });
  } catch (error) {
    logger.error(
      "Get cracked passwords error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch cracked passwords",
      },
      500,
    );
  }
});

// GET /api/results - Get all results with filtering
resultsRouter.get("/", zValidator("query", resultsQuerySchema), async (c) => {
  try {
    const userId = getUserId(c);
    const { jobId, networkId, type, limit, offset } = c.req.valid("query");

    // Build WHERE clause with user isolation
    const conditions: any[] = [];

    // Join with jobs table to ensure user owns the results
    const query = db
      .select({
        id: jobResults.id,
        jobId: jobResults.jobId,
        type: jobResults.type,
        data: jobResults.data,
        createdAt: jobResults.createdAt,
        // Include job information
        job: {
          id: jobs.id,
          name: jobs.name,
          networkId: jobs.networkId,
          dictionaryId: jobs.dictionaryId,
          status: jobs.status,
        },
        // Include network information
        network: {
          id: networks.id,
          ssid: networks.ssid,
          bssid: networks.bssid,
          encryption: networks.encryption,
        },
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .innerJoin(networks, eq(jobs.networkId, networks.id))
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobResults.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply filters if provided
    let filteredQuery = query.$dynamic();

    if (jobId) {
      filteredQuery = filteredQuery.where(eq(jobResults.jobId, jobId));
    }

    if (networkId) {
      filteredQuery = filteredQuery.where(eq(jobs.networkId, networkId));
    }

    if (type) {
      filteredQuery = filteredQuery.where(eq(jobResults.type, type));
    }

    const results = await filteredQuery;

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .where(eq(jobs.userId, userId));

    logger.info("Results fetched", "results", {
      userId,
      count: results.length,
      total: count,
      filters: { jobId, networkId, type },
    });

    return c.json({
      success: true,
      data: results,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + limit < count,
      },
    });
  } catch (error) {
    logger.error(
      "Get results error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch results",
      },
      500,
    );
  }
});

// GET /api/results/by-job/:jobId - Get results for a specific job
resultsRouter.get("/by-job/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const userId = getUserId(c);

  try {
    // Verify user owns the job
    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, jobId),
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

    // Fetch results for this job
    const results = await db
      .select({
        id: jobResults.id,
        jobId: jobResults.jobId,
        type: jobResults.type,
        data: jobResults.data,
        createdAt: jobResults.createdAt,
      })
      .from(jobResults)
      .where(eq(jobResults.jobId, jobId))
      .orderBy(desc(jobResults.createdAt));

    logger.info("Job results fetched", "results", {
      userId,
      jobId,
      count: results.length,
    });

    return c.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    logger.error(
      "Get job results error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
      {
        jobId,
        userId,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch job results",
      },
      500,
    );
  }
});

// GET /api/results/by-network/:networkId - Get results for a specific network
resultsRouter.get("/by-network/:networkId", async (c) => {
  const networkId = c.req.param("networkId");
  const userId = getUserId(c);

  try {
    // Verify user owns the network
    const network = await db.query.networks.findFirst({
      where: eq(networks.id, networkId),
    });

    if (!network) {
      return c.json(
        {
          success: false,
          error: "Network not found",
        },
        404,
      );
    }

    if (network.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    // Fetch results for this network (via jobs)
    const results = await db
      .select({
        id: jobResults.id,
        jobId: jobResults.jobId,
        type: jobResults.type,
        data: jobResults.data,
        createdAt: jobResults.createdAt,
        job: {
          id: jobs.id,
          name: jobs.name,
          status: jobs.status,
          dictionaryId: jobs.dictionaryId,
        },
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .where(eq(jobs.networkId, networkId))
      .orderBy(desc(jobResults.createdAt));

    logger.info("Network results fetched", "results", {
      userId,
      networkId,
      count: results.length,
    });

    return c.json({
      success: true,
      data: results,
      count: results.length,
      network: {
        id: network.id,
        ssid: network.ssid,
        bssid: network.bssid,
        encryption: network.encryption,
      },
    });
  } catch (error) {
    logger.error(
      "Get network results error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
      {
        networkId,
        userId,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch network results",
      },
      500,
    );
  }
});

// GET /api/results/:id - Get a single result by ID (MUST be last after all specific routes)
resultsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = getUserId(c);

  try {
    // Fetch result with job and network information
    const [result] = await db
      .select({
        id: jobResults.id,
        jobId: jobResults.jobId,
        type: jobResults.type,
        data: jobResults.data,
        createdAt: jobResults.createdAt,
        job: {
          id: jobs.id,
          name: jobs.name,
          networkId: jobs.networkId,
          dictionaryId: jobs.dictionaryId,
          status: jobs.status,
        },
        network: {
          id: networks.id,
          ssid: networks.ssid,
          bssid: networks.bssid,
          encryption: networks.encryption,
        },
      })
      .from(jobResults)
      .innerJoin(jobs, eq(jobResults.jobId, jobs.id))
      .innerJoin(networks, eq(jobs.networkId, networks.id))
      .where(and(eq(jobResults.id, id), eq(jobs.userId, userId)))
      .limit(1);

    if (!result) {
      return c.json(
        {
          success: false,
          error: "Result not found",
        },
        404,
      );
    }

    logger.info("Result fetched", "results", {
      userId,
      resultId: id,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(
      "Get result error",
      "results",
      error instanceof Error ? error : new Error(String(error)),
      {
        resultId: id,
        userId,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch result",
      },
      500,
    );
  }
});

export { resultsRouter as resultsRoutes };
