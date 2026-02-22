import WebSocket from "ws";
import { logger } from "./logger";
import { env } from "@/config/env";

interface ClientConnection {
  id: string;
  userId: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: number;
}

interface JobUpdateMessage {
  type: "job_update";
  data: {
    id: string;
    status: string;
    progress: number;
    startTime?: string;
    endTime?: string;
    errorMessage?: string;
    result?: any;
    metadata?: any;
  };
}

interface SystemMessage {
  type: "system";
  data: {
    message: string;
    level: "info" | "warning" | "error";
    timestamp: string;
  };
}

interface PongMessage {
  type: "pong";
  data: {
    timestamp: number;
  };
}

interface SubscribeMessage {
  type: "subscribe";
  data: {
    jobId?: string;
    channel?: "all_jobs" | "user_jobs";
  };
}

interface UnsubscribeMessage {
  type: "unsubscribe";
  data: {
    jobId?: string;
    channel?: "all_jobs" | "user_jobs";
  };
}

type WebSocketMessage =
  | JobUpdateMessage
  | SystemMessage
  | PongMessage
  | SubscribeMessage
  | UnsubscribeMessage;

class WebSocketServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private port: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(port: number = parseInt(env.WS_PORT || "3002")) {
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({
          port: this.port,
          verifyClient: this.verifyClient.bind(this),
        });

        this.wss.on("connection", this.handleConnection.bind(this));
        this.wss.on("error", this.handleServerError.bind(this));

        // Start heartbeat/ping mechanism
        this.startHeartbeat();

        logger.info("WebSocket server started", "websocket", {
          port: this.port,
        });

        resolve();
      } catch (error) {
        logger.error("Failed to start WebSocket server", "websocket", {
          error: error instanceof Error ? error.message : "Unknown error",
          port: this.port,
        });
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isShuttingDown = true;

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.wss) {
        this.wss.close(() => {
          logger.info("WebSocket server stopped", "websocket");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private verifyClient(info: any): boolean {
    // In a real implementation, you would verify authentication here
    // For now, we'll accept all connections and handle auth in the connection handler
    return true;
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = this.generateClientId();
    const userId = this.extractUserIdFromRequest(request) || "anonymous";

    const client: ClientConnection = {
      id: clientId,
      userId,
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, client);

    logger.info("New WebSocket connection", "websocket", {
      clientId,
      userId,
      userAgent: request.headers["user-agent"],
      remoteAddress: request.socket.remoteAddress,
    });

    // Set up message handlers
    ws.on("message", (data) => this.handleMessage(clientId, data));
    ws.on("close", (code, reason) =>
      this.handleDisconnection(clientId, code, reason),
    );
    ws.on("error", (error) => this.handleClientError(clientId, error));
    ws.on("pong", () => this.handlePong(clientId));

    // Send welcome message
    this.sendMessage(clientId, {
      type: "system",
      data: {
        message: "Connected to CrackHouse WebSocket server",
        level: "info",
        timestamp: new Date().toISOString(),
      },
    } as SystemMessage);
  }

  private handleMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      const message: WebSocketMessage = JSON.parse(data.toString());
      const timestamp = Date.now();

      logger.debug("WebSocket message received", "websocket", {
        clientId,
        type: message.type,
        timestamp,
      });

      switch (message.type) {
        case "subscribe":
          this.handleSubscribe(client, message as SubscribeMessage);
          break;
        case "unsubscribe":
          this.handleUnsubscribe(client, message as UnsubscribeMessage);
          break;
        case "pong":
          this.handlePong(clientId);
          break;
        default:
          logger.warn("Unknown message type", "websocket", {
            clientId,
            type: (message as any).type,
          });
      }
    } catch (error) {
      logger.error("Failed to handle WebSocket message", "websocket", {
        clientId,
        error: error instanceof Error ? error.message : "Unknown error",
        data: data.toString(),
      });
    }
  }

  private handleSubscribe(
    client: ClientConnection,
    message: SubscribeMessage,
  ): void {
    if (message.data.jobId) {
      client.subscriptions.add(`job:${message.data.jobId}`);
      logger.debug("Client subscribed to job", "websocket", {
        clientId: client.id,
        jobId: message.data.jobId,
      });
    }

    if (message.data.channel) {
      client.subscriptions.add(`channel:${message.data.channel}`);
      logger.debug("Client subscribed to channel", "websocket", {
        clientId: client.id,
        channel: message.data.channel,
      });
    }
  }

  private handleUnsubscribe(
    client: ClientConnection,
    message: UnsubscribeMessage,
  ): void {
    if (message.data.jobId) {
      client.subscriptions.delete(`job:${message.data.jobId}`);
    }

    if (message.data.channel) {
      client.subscriptions.delete(`channel:${message.data.channel}`);
    }
  }

  private handleDisconnection(
    clientId: string,
    code: number,
    reason: string,
  ): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info("WebSocket client disconnected", "websocket", {
      clientId,
      userId: client.userId,
      code,
      reason: reason.toString(),
    });

    this.clients.delete(clientId);
  }

  private handleClientError(clientId: string, error: Error): void {
    logger.error("WebSocket client error", "websocket", {
      clientId,
      error: error.message,
      stack: error.stack,
    });
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  private handleServerError(error: Error): void {
    logger.error("WebSocket server error", "websocket", {
      error: error.message,
      stack: error.stack,
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 1 minute timeout

      for (const [clientId, client] of this.clients) {
        // Check for timeout
        if (now - client.lastPing > timeout) {
          logger.warn("Client timeout, closing connection", "websocket", {
            clientId,
            lastPing: client.lastPing,
            timeout,
          });
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        // Send ping
        try {
          client.ws.ping();
        } catch (error) {
          logger.error("Failed to send ping", "websocket", {
            clientId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          client.ws.terminate();
          this.clients.delete(clientId);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractUserIdFromRequest(request: any): string | null {
    // Extract user ID from query parameters or headers
    const url = new URL(request.url || "", "http://localhost");
    return (
      url.searchParams.get("userId") ||
      (request.headers["x-user-id"] as string) ||
      null
    );
  }

  // Public methods for broadcasting updates

  broadcastJobUpdate(jobUpdate: JobUpdateMessage["data"]): void {
    const message: JobUpdateMessage = {
      type: "job_update",
      data: jobUpdate,
    };

    const recipients = new Set<string>();

    // Find clients subscribed to this specific job
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(`job:${jobUpdate.id}`)) {
        recipients.add(clientId);
      }
    }

    // Find clients subscribed to user jobs (if we have user info)
    for (const [clientId, client] of this.clients) {
      if (
        client.subscriptions.has("channel:user_jobs") &&
        client.userId === jobUpdate.metadata?.userId
      ) {
        recipients.add(clientId);
      }
    }

    // Find clients subscribed to all jobs
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has("channel:all_jobs")) {
        recipients.add(clientId);
      }
    }

    // Send to all recipients
    for (const clientId of recipients) {
      this.sendMessage(clientId, message);
    }

    logger.debug("Job update broadcasted", "websocket", {
      jobId: jobUpdate.id,
      status: jobUpdate.progress,
      recipientCount: recipients.size,
    });
  }

  broadcastSystemMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
  ): void {
    const systemMessage: SystemMessage = {
      type: "system",
      data: {
        message,
        level,
        timestamp: new Date().toISOString(),
      },
    };

    for (const clientId of this.clients.keys()) {
      this.sendMessage(clientId, systemMessage);
    }

    logger.info("System message broadcasted", "websocket", {
      message,
      level,
      clientCount: this.clients.size,
    });
  }

  private sendMessage(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error("Failed to send WebSocket message", "websocket", {
        clientId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  // Health check method
  getStats(): { clientCount: number; uptime: number; isHealthy: boolean } {
    return {
      clientCount: this.clients.size,
      uptime: process.uptime(),
      isHealthy: !this.isShuttingDown,
    };
  }
}

// Singleton instance
let wsServer: WebSocketServer | null = null;

export function getWebSocketServer(): WebSocketServer {
  if (!wsServer) {
    wsServer = new WebSocketServer();
  }
  return wsServer;
}

export {
  WebSocketServer,
  WebSocketMessage,
  JobUpdateMessage,
  SystemMessage,
  ClientConnection,
};
