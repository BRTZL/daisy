import { useCallback, useEffect, useRef, useState } from "react";
import type { LoopStatus, TaskStats } from "../lib/api";

export interface LogEntry {
  id: string;
  text: string;
  timestamp: string;
  level: "info" | "error" | "warning" | "success";
}

interface WebSocketMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loopStatus, setLoopStatus] = useState<LoopStatus>({
    running: false,
    iteration: 0,
    maxIterations: null,
    mode: "task-based",
    startedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  });
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    skipped: 0,
    blocked: 0,
  });
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logIdCounter = useRef(0);

  // Define handleMessage first since connect depends on it
  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case "log": {
        const data = message.data as {
          text: string;
          timestamp: string;
          level: string;
        };
        const entry: LogEntry = {
          id: `log-${logIdCounter.current++}`,
          text: data.text,
          timestamp: data.timestamp || new Date().toISOString(),
          level: (data.level as LogEntry["level"]) || "info",
        };
        setLogs((prev) => [...prev.slice(-500), entry]); // Keep last 500 logs
        break;
      }

      case "task-updated": {
        // Trigger a refetch of tasks via React Query
        // The component using useTasks will handle this
        break;
      }

      case "iteration-start": {
        const data = message.data as {
          iteration: number;
          maxIterations: number | null;
        };
        setLoopStatus((prev) => ({
          ...prev,
          running: true,
          iteration: data.iteration,
          maxIterations: data.maxIterations,
        }));
        break;
      }

      case "iteration-complete": {
        const data = message.data as {
          iteration: number;
          usage: { inputTokens: number; outputTokens: number; costUsd: number };
          complete: boolean;
        };
        setLoopStatus((prev) => ({
          ...prev,
          iteration: data.iteration,
          usage: {
            inputTokens: prev.usage.inputTokens + data.usage.inputTokens,
            outputTokens: prev.usage.outputTokens + data.usage.outputTokens,
            costUsd: prev.usage.costUsd + data.usage.costUsd,
          },
          running: !data.complete,
        }));
        break;
      }

      case "loop-complete": {
        setLoopStatus((prev) => ({
          ...prev,
          running: false,
        }));

        // Show browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Daisy Loop Complete", {
            body: "All work has been completed.",
            icon: "/daisy.svg",
          });
        }
        break;
      }

      case "loop-status": {
        const data = message.data as LoopStatus;
        setLoopStatus(data);
        break;
      }

      case "stats": {
        const data = message.data as TaskStats;
        setStats(data);
        break;
      }

      case "error": {
        const data = message.data as { message: string };
        const entry: LogEntry = {
          id: `log-${logIdCounter.current++}`,
          text: `Error: ${data.message}`,
          timestamp: new Date().toISOString(),
          level: "error",
        };
        setLogs((prev) => [...prev.slice(-500), entry]);

        // Show browser notification for errors
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Daisy Error", {
            body: data.message,
            icon: "/daisy.svg",
          });
        }
        break;
      }
    }
  }, []);

  const connect = useCallback(() => {
    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log("WebSocket connected");

        // Subscribe to all channels
        ws.send(
          JSON.stringify({ type: "subscribe", data: { channel: "all" } })
        );
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected, reconnecting in 2s...");

        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch (e) {
      console.error("Failed to create WebSocket:", e);
      // Retry connection
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    }
  }, [handleMessage]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    logs,
    loopStatus,
    stats,
    isConnected,
    clearLogs,
  };
}
