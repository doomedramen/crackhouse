// Load environment variables based on NODE_ENV
import "dotenv-flow/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { environmentAwareCORS, publicApiCORS } from "./middleware/cors";
import { env } from "./config/env";
import { logger as appLogger } from "./lib/logger";

// Import routes
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { jobManagementRoutes } from "./routes/jobs";
import { jobUpdateRoutes } from "./routes/jobs-update";
import { networksRoutes } from "./routes/networks";
import { dictionariesRoutes } from "./routes/dictionaries";
import { resultsRoutes } from "./routes/results";
import { queueRoutes } from "./routes/queue-management";
import { capturesRoutes } from "./routes/captures";
import { uploadRoutes } from "./routes/upload";
import { configRoutes } from "./routes/config";
import { auditRoutes } from "./routes/audit";
import { healthRoutes } from "./routes/health";
import { securityRoutes } from "./routes/security-monitoring";
import { virusScannerRoutes } from "./routes/virus-scanner";
import { websocketRoutes } from "./routes/websocket";
import { storageRoutes } from "./routes/storage";
import emailRoutes from "./routes/email";

// Import middleware
import { securityMiddleware } from "./middleware/security";
import {
  dbSecurityMiddleware,
  parameterValidationMiddleware,
} from "./middleware/db-security";

import { auth } from "./lib/auth";
import { getWebSocketServer } from "./lib/websocket";
import type { HonoAuthContext } from "./types/auth";
import { configService } from "./services/config.service";
import { emailService } from "./services/email.service";
import { emailQueue } from "./lib/email-queue";

const app = new Hono<HonoAuthContext>();

// Security and utility middleware (applied globally)
app.use("*", logger());
// Don't use prettyJSON globally as it can consume request body before Better Auth
// app.use('*', prettyJSON())

// Environment-aware CORS configuration
app.use("*", environmentAwareCORS());

// Add middleware to save session and user in context as per documentation
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    c.set("userId", null);
    await next();
    return;
  }

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("userId", session.user.id);
  await next();
});

// Database security and parameter validation (exclude auth routes)
app.use("*", (c, next) => {
  if (c.req.path.startsWith("/api/auth")) {
    return next();
  }
  return dbSecurityMiddleware()(c, next);
});
app.use("*", (c, next) => {
  if (c.req.path.startsWith("/api/auth")) {
    return next();
  }
  return parameterValidationMiddleware()(c, next);
});

// Security header validation (exclude auth routes)
// app.use('*', (c, next) => {
//   if (c.req.path.startsWith('/api/auth')) {
//     return next()
//   }
//   return securityHeaderValidator()(c, next)
// }) // Temporarily disabled for testing

// Security middleware (exclude auth routes - Better Auth handles its own security)
app.use("*", (c, next) => {
  if (c.req.path.startsWith("/api/auth")) {
    return next();
  }
  return securityMiddleware(c, next);
});

// API routes
app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/jobs", jobManagementRoutes);
app.route("/api/jobs/update", jobUpdateRoutes);
app.route("/api/networks", networksRoutes);
app.route("/api/dictionaries", dictionariesRoutes);
app.route("/api/results", resultsRoutes);
app.route("/api/queue", queueRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/captures", capturesRoutes);
app.route("/api/config", configRoutes);
app.route("/api/audit", auditRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/storage", storageRoutes);
app.route("/api/websocket", websocketRoutes);
app.route("/security", securityRoutes);
app.route("/virus-scanner", virusScannerRoutes);
app.route("/api/email", emailRoutes);

// Health check (no auth required) - Public CORS
app.get("/health", publicApiCORS(), (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "crackhouse-api",
    version: "1.0.0",
    environment: env.NODE_ENV,
  });
});

const port = parseInt(env.PORT);

// Export app for testing (must be before startServer)
export { app };

async function startServer() {
  try {
    // Initialize config service
    await configService.loadConfig();
    appLogger.info("Config service initialized", "startup");

    // Initialize email service
    const emailEnabled = await configService.getBoolean("email-enabled", false);
    if (emailEnabled) {
      try {
        await emailService.initialize();
        appLogger.info("Email service initialized", "startup");
      } catch (error) {
        appLogger.error("Failed to initialize email service", "startup", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    } else {
      appLogger.info("Email service disabled", "startup");
    }

    // Initialize email queue
    if (emailEnabled) {
      try {
        await emailQueue.initialize();
        appLogger.info("Email queue initialized", "startup");
      } catch (error) {
        appLogger.error("Failed to initialize email queue", "startup", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // Start WebSocket server first
    const wsServer = getWebSocketServer();
    await wsServer.start();
    appLogger.info("WebSocket server started", "startup", {
      port: parseInt(env.WS_PORT),
    });

    // Start HTTP server
    appLogger.info("CrackHouse API Server starting", "startup", {
      port,
      environment: env.NODE_ENV,
      healthCheck: `http://localhost:${port}/health`,
      websocketInfo: `http://localhost:${port}/api/websocket/info`,
    });

    serve({
      fetch: app.fetch,
      port,
    }).on("error", (error) => {
      appLogger.error("Server encountered an error", "server", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      process.exit(1);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      appLogger.info("Shutting down servers (SIGINT)", "shutdown");
      await wsServer.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      appLogger.info("Shutting down servers (SIGTERM)", "shutdown");
      await wsServer.stop();
      process.exit(0);
    });
  } catch (error) {
    appLogger.error("Failed to start servers", "startup", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    process.exit(1);
  }
}

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  startServer();
}
