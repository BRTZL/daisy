/**
 * Daisy Server Entry Point
 * HTTP server with REST API and WebSocket for real-time updates
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createApp } from "./app.js";
import { LoopService } from "./services/loop-service.js";

const PORT = parseInt(process.env.PORT || "4141", 10);
const HOST = process.env.HOST || "0.0.0.0";

// Create the loop service (singleton)
const loopService = new LoopService();

// Create the Hono app
const app = createApp(loopService);

// Get the request listener for Hono
const requestListener = getRequestListener(app.fetch);

// Create HTTP server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Let Hono handle HTTP requests
  requestListener(req, res);
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  // Register client with loop service
  loopService.addClient(
    ws as unknown as { send: (data: string) => void; readyState: number }
  );

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      // Handle client messages if needed
      if (data.type === "subscribe") {
        console.log(`Client subscribed to: ${data.data?.channel || "all"}`);
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    loopService.removeClient(
      ws as unknown as { send: (data: string) => void; readyState: number }
    );
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

// Start the server
console.log(`Starting Daisy server on ${HOST}:${PORT}...`);

server.listen(PORT, HOST, () => {
  console.log(`Daisy server running at http://${HOST}:${PORT}`);
  console.log(`Web UI available at http://daisy.test`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  loopService.stop();
  wss.close();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  loopService.stop();
  wss.close();
  server.close();
  process.exit(0);
});
