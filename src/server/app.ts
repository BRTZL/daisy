/**
 * Hono App Setup
 * REST API routes and static file serving
 */

import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createApiRoutes } from "./routes/api.js";
import type { LoopService } from "./services/loop-service.js";

// Get the directory of this module (dist/server/)
const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
// Web assets are at dist/web, which is ../web relative to dist/server
const WEB_ROOT = nodePath.resolve(__dirname, "../web");

export function createApp(loopService: LoopService) {
  const app = new Hono();

  // Middleware
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://daisy.test", "http://daisy.test:4141"],
      credentials: true,
    })
  );

  // API routes
  const apiRoutes = createApiRoutes(loopService);
  app.route("/api", apiRoutes);

  // Serve static files from the web build
  app.use(
    "/*",
    serveStatic({
      root: WEB_ROOT,
      rewriteRequestPath: (path) => {
        // For SPA routing, serve index.html for non-file requests
        if (!path.includes(".")) {
          return "/index.html";
        }
        return path;
      },
    })
  );

  // Fallback to index.html for SPA
  app.get("*", async (c) => {
    // Try to read index.html
    try {
      const indexPath = nodePath.join(WEB_ROOT, "index.html");
      const content = fs.readFileSync(indexPath, "utf-8");
      return c.html(content);
    } catch {
      return c.text("Daisy Web UI not found. Run: npm run build:web", 404);
    }
  });

  return app;
}
