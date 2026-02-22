"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthSession } from "./api-hooks";

interface JobUpdate {
  id: string;
  status: string;
  progress: number;
  startTime?: string;
  endTime?: string;
  errorMessage?: string;
  result?: any;
  metadata?: any;
}

interface SystemMessage {
  message: string;
  level: "info" | "warning" | "error";
  timestamp: string;
}

interface WebSocketMessage {
  type: "job_update" | "system" | "pong";
  data: JobUpdate | SystemMessage | { timestamp: number };
}

export interface UseWebSocketOptions {
  onJobUpdate?: (update: JobUpdate) => void;
  onSystemMessage?: (message: SystemMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onJobUpdate,
    onSystemMessage,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const { data: authData } = useAuthSession();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionStatus("connecting");
      setLastError(null);

      // Determine WebSocket URL based on current environment
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      const wsUrl = `${protocol}//${wsHost.replace(":3001", ":3002")}?userId=${(authData as any)?.user?.id || "anonymous"}`;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
        onConnect?.();

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ type: "ping", data: { timestamp: Date.now() } }),
            );
          }
        }, 30000); // Ping every 30 seconds

        // Subscribe to user's jobs
        wsRef.current?.send(
          JSON.stringify({
            type: "subscribe",
            data: { channel: "user_jobs" },
          }),
        );
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case "job_update":
              onJobUpdate?.(message.data as JobUpdate);
              break;
            case "system":
              onSystemMessage?.(message.data as SystemMessage);
              break;
            case "pong":
              // Heartbeat response received
              break;
            default:
              console.warn("Unknown WebSocket message type:", message.type);
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus("disconnected");
        onDisconnect?.();

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt reconnection if enabled and not a normal closure
        if (
          autoReconnect &&
          event.code !== 1000 &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current++;
          setLastError(
            `Connection lost. Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionStatus("error");
          setLastError("Max reconnection attempts reached");
        }
      };

      wsRef.current.onerror = (error) => {
        setConnectionStatus("error");
        setLastError("WebSocket connection error");
        onError?.(error);
      };
    } catch (error) {
      setConnectionStatus("error");
      setLastError("Failed to create WebSocket connection");
      console.error("WebSocket connection error:", error);
    }
  }, [
    authData,
    onConnect,
    onDisconnect,
    onError,
    onJobUpdate,
    onSystemMessage,
    autoReconnect,
    reconnectInterval,
    maxReconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus("disconnected");
    reconnectAttemptsRef.current = 0;
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "subscribe",
          data: { jobId },
        }),
      );
    }
  }, []);

  const unsubscribeFromJob = useCallback((jobId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "unsubscribe",
          data: { jobId },
        }),
      );
    }
  }, []);

  // Auto-connect when auth session is available
  useEffect(() => {
    if ((authData as any)?.user?.id) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [(authData as any)?.user?.id, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionStatus,
    lastError,
    connect,
    disconnect,
    subscribeToJob,
    unsubscribeFromJob,
  };
}

// Hook for job-specific updates
export function useJobUpdates(
  jobId: string,
  onUpdate?: (update: JobUpdate) => void,
) {
  const [jobUpdate, setJobUpdate] = useState<JobUpdate | null>(null);
  const { subscribeToJob, unsubscribeFromJob } = useWebSocket({
    onJobUpdate: (update) => {
      if (update.id === jobId) {
        setJobUpdate(update);
        onUpdate?.(update);
      }
    },
  });

  useEffect(() => {
    if (jobId) {
      subscribeToJob(jobId);
    }

    return () => {
      if (jobId) {
        unsubscribeFromJob(jobId);
      }
    };
  }, [jobId, subscribeToJob, unsubscribeFromJob]);

  return jobUpdate;
}

// Hook for system messages
export function useSystemMessages() {
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const maxMessages = 50; // Keep only last 50 messages

  const { isConnected } = useWebSocket({
    onSystemMessage: (message) => {
      setMessages((prev) => {
        const newMessages = [...prev, message];
        return newMessages.slice(-maxMessages); // Keep only last N messages
      });
    },
  });

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    clearMessages,
    isConnected,
  };
}
