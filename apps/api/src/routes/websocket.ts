import { Hono } from "hono";
import { getWebSocketServer } from "@/lib/websocket";
import { authenticate } from "@/middleware/auth";
import { env } from "@/config/env";

const websocket = new Hono();

// Apply authentication middleware to all routes
websocket.use("*", authenticate);

/**
 * Get WebSocket connection info
 */
websocket.get("/info", async (c) => {
  try {
    const wsServer = getWebSocketServer();
    const stats = wsServer.getStats();

    return c.json({
      success: true,
      data: {
        websocketUrl: `ws://${c.req.header("host")?.replace("http", "ws") || "ws://localhost:3002"}`,
        port: parseInt(env.WS_PORT),
        ...stats,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "Failed to get WebSocket info",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500,
    );
  }
});

/**
 * Broadcast system message (admin only)
 */
websocket.post("/broadcast", async (c) => {
  try {
    const userId = c.get("userId");
    const { message, level = "info" } = await c.req.json();

    // In a real implementation, you would check if user is admin here
    // For now, we'll allow any authenticated user

    const wsServer = getWebSocketServer();
    wsServer.broadcastSystemMessage(message, level);

    return c.json({
      success: true,
      message: "System message broadcasted successfully",
      data: {
        message,
        level,
        clientCount: wsServer.getStats().clientCount,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "Failed to broadcast system message",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500,
    );
  }
});

/**
 * Health check for WebSocket server
 */
websocket.get("/health", async (c) => {
  try {
    const wsServer = getWebSocketServer();
    const stats = wsServer.getStats();

    return c.json({
      success: true,
      data: {
        status: stats.isHealthy ? "healthy" : "unhealthy",
        ...stats,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: "WebSocket health check failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
        data: {
          status: "unhealthy",
        },
      },
      500,
    );
  }
});

export { websocket as websocketRoutes };
