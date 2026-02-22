import { Hono } from "hono";
import { logger } from "../lib/logger";
import { healthCheckService } from "../services/health-check.service";
import { publicApiCORS } from "../middleware/cors";
import { env } from "@/config/env";

const healthRoutes = new Hono();

healthRoutes.use("*", publicApiCORS);

/**
 * GET /health
 * Basic health check (no auth required)
 */
healthRoutes.get("/", async (c) => {
  try {
    logger.info("Basic health check requested", "health-api");

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "crackhouse-api",
      version: "1.0.0",
      environment: env.NODE_ENV,
    });
  } catch (error) {
    logger.error("Health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Health check failed",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/health
 * Detailed health check (no auth required)
 */
healthRoutes.get("/api/v1/health", async (c) => {
  try {
    logger.info("Detailed health check requested", "health-api");

    const healthResult = await healthCheckService.performHealthCheck();

    const statusCode =
      healthResult.status === "healthy"
        ? 200
        : healthResult.status === "degraded"
          ? 200
          : 503;

    return c.json(healthResult, statusCode);
  } catch (error) {
    logger.error("Detailed health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Health check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

/**
 * GET /api/v1/health/summary
 * Get service summary (no auth required)
 */
healthRoutes.get("/api/v1/health/summary", async (c) => {
  try {
    logger.info("Health summary requested", "health-api");

    const summary = healthCheckService.getSummary();

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      summary: {
        uptime: summary.uptime,
        uptimeFormatted: summary.uptimeFormatted,
        startTime: summary.startTime.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Health summary failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Health summary failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/health/database
 * Database health check (no auth required)
 */
healthRoutes.get("/api/v1/health/database", async (c) => {
  try {
    logger.info("Database health check requested", "health-api");

    const healthResult = await healthCheckService.performHealthCheck();

    return c.json({
      status: healthResult.checks.database.status,
      timestamp: new Date().toISOString(),
      database: healthResult.checks.database,
    });
  } catch (error) {
    logger.error("Database health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Database health check failed",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/health/redis
 * Redis health check (no auth required)
 */
healthRoutes.get("/api/v1/health/redis", async (c) => {
  try {
    logger.info("Redis health check requested", "health-api");

    const healthResult = await healthCheckService.performHealthCheck();

    return c.json({
      status: healthResult.checks.redis.status,
      timestamp: new Date().toISOString(),
      redis: healthResult.checks.redis,
    });
  } catch (error) {
    logger.error("Redis health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Redis health check failed",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/health/disk
 * Disk health check (no auth required)
 */
healthRoutes.get("/api/v1/health/disk", async (c) => {
  try {
    logger.info("Disk health check requested", "health-api");

    const healthResult = await healthCheckService.performHealthCheck();

    return c.json({
      status: healthResult.checks.disk.status,
      timestamp: new Date().toISOString(),
      disk: healthResult.checks.disk,
    });
  } catch (error) {
    logger.error("Disk health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Disk health check failed",
      },
      500,
    );
  }
});

/**
 * GET /api/v1/health/workers
 * Workers health check (no auth required)
 */
healthRoutes.get("/api/v1/health/workers", async (c) => {
  try {
    logger.info("Workers health check requested", "health-api");

    const healthResult = await healthCheckService.performHealthCheck();

    return c.json({
      status: healthResult.checks.workers.status,
      timestamp: new Date().toISOString(),
      workers: healthResult.checks.workers,
    });
  } catch (error) {
    logger.error("Workers health check failed", "health-api", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    return c.json(
      {
        status: "error",
        error: "Workers health check failed",
      },
      500,
    );
  }
});

export { healthRoutes };
