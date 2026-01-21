/**
 * REST API Routes
 */

import { existsSync } from "node:fs";
import nodePath from "node:path";
import { Hono } from "hono";
import {
  addKnownProject,
  getCurrentProjectPath,
  getHistory,
  getKnownProjects,
  getProjectSettings,
  removeKnownProject,
  setCurrentProject as setGlobalCurrentProject,
  updateProjectSettings,
} from "../../storage/global.js";
import {
  findProjectRoot,
  findTask,
  getTaskStats,
  getTasks,
  insertTask,
  removeTaskCascade,
  updateTask,
} from "../../storage/project.js";
import type { Task } from "../../storage/types.js";
import type { LoopService } from "../services/loop-service.js";
import { PlanningService } from "../services/planning-service.js";

export function createApiRoutes(loopService: LoopService) {
  const planningService = new PlanningService();
  const api = new Hono();

  // Helper to get project path (checks: global config > env var > cwd)
  const getProjectPath = (): string | null => {
    return (
      getCurrentProjectPath() ||
      process.env.DAISY_PROJECT_PATH ||
      findProjectRoot(process.cwd()) ||
      null
    );
  };

  // ============================================================================
  // Project Routes
  // ============================================================================

  // List all known projects
  api.get("/projects", async (c) => {
    const projects = getKnownProjects();
    const currentPath = getCurrentProjectPath();

    return c.json({
      projects: projects.map((p) => ({
        ...p,
        isCurrent: p.path === currentPath,
      })),
      currentPath,
    });
  });

  // Get current project details
  api.get("/projects/current", async (c) => {
    const projectPath = getProjectPath();

    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const settings = getProjectSettings(projectPath);
    const stats = getTaskStats(projectPath);
    const name = projectPath.split("/").pop() || "unknown";

    return c.json({
      name,
      path: projectPath,
      settings,
      stats,
    });
  });

  // Set/switch current project
  api.post("/projects/use", async (c) => {
    const body = await c.req.json<{ path: string }>();

    if (!body.path) {
      return c.json({ error: "Path is required" }, 400);
    }

    // Resolve to absolute path
    const projectPath = nodePath.isAbsolute(body.path)
      ? body.path
      : nodePath.resolve(process.cwd(), body.path);

    // Check if .daisy directory exists
    const daisyDir = nodePath.join(projectPath, ".daisy");
    if (!existsSync(daisyDir)) {
      return c.json(
        { error: `No daisy project found at ${projectPath}. Run 'daisy init ${projectPath}' first.` },
        404
      );
    }

    // Add to known projects and set as current
    addKnownProject(projectPath);
    setGlobalCurrentProject(projectPath);

    const settings = getProjectSettings(projectPath);
    const stats = getTaskStats(projectPath);
    const name = projectPath.split("/").pop() || "unknown";

    return c.json({
      success: true,
      project: {
        name,
        path: projectPath,
        settings,
        stats,
      },
    });
  });

  // Remove a project from the list
  api.delete("/projects/:path", async (c) => {
    const projectPath = decodeURIComponent(c.req.param("path"));
    const removed = removeKnownProject(projectPath);

    if (!removed) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({ success: true });
  });

  // ============================================================================
  // Task Routes
  // ============================================================================

  api.get("/tasks", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const tasks = getTasks(projectPath);
    return c.json(tasks);
  });

  api.post("/tasks", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const body = await c.req.json<{
      id: string;
      title: string;
      description?: string;
      parentId?: string;
      dependsOn?: string[];
      acceptanceCriteria?: string[];
      afterId?: string;
      beforeId?: string;
    }>();

    const task: Task = {
      id: body.id,
      title: body.title,
      description: body.description,
      status: "pending",
      dependsOn: body.dependsOn,
      acceptanceCriteria: body.acceptanceCriteria,
    };

    const result = insertTask(
      projectPath,
      task,
      body.parentId,
      body.afterId
        ? { afterId: body.afterId }
        : body.beforeId
          ? { beforeId: body.beforeId }
          : undefined
    );

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    // Broadcast task update
    loopService.broadcastTaskUpdate();

    return c.json(task, 201);
  });

  api.put("/tasks/:id", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const taskId = c.req.param("id");
    const body = await c.req.json<Partial<Task>>();

    const result = updateTask(projectPath, taskId, {
      title: body.title,
      description: body.description,
      dependsOn: body.dependsOn,
      acceptanceCriteria: body.acceptanceCriteria,
    });

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    // Get updated task
    const tasks = getTasks(projectPath);
    const updatedTask = findTask(tasks, taskId);

    // Broadcast task update
    loopService.broadcastTaskUpdate();

    return c.json(updatedTask);
  });

  api.delete("/tasks/:id", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const taskId = c.req.param("id");
    const result = removeTaskCascade(projectPath, taskId);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    // Broadcast task update
    loopService.broadcastTaskUpdate();

    return c.json({ success: true, removedCount: result.removedCount });
  });

  // ============================================================================
  // Stats Routes
  // ============================================================================

  api.get("/stats", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const stats = getTaskStats(projectPath);
    return c.json(stats);
  });

  // ============================================================================
  // Loop Routes
  // ============================================================================

  api.get("/loop/status", async (c) => {
    return c.json(loopService.getStatus());
  });

  api.post("/loop/start", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const body = await c.req
      .json<{
        maxIterations?: number;
        useTasks?: boolean;
        skipPermissions?: boolean;
      }>()
      .catch(() => ({ maxIterations: undefined, useTasks: undefined, skipPermissions: undefined }));

    try {
      await loopService.start({
        projectPath,
        maxIterations: body.maxIterations,
        useTasks: body.useTasks ?? true,
        skipPermissions: body.skipPermissions ?? false,
      });
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to start" },
        500
      );
    }
  });

  api.post("/loop/stop", async (c) => {
    loopService.stop();
    return c.json({ success: true });
  });

  // ============================================================================
  // History Routes
  // ============================================================================

  api.get("/history", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const history = getHistory(projectPath);
    return c.json(history);
  });

  // ============================================================================
  // Settings Routes
  // ============================================================================

  api.get("/settings", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const settings = getProjectSettings(projectPath);
    return c.json(settings);
  });

  api.put("/settings", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const body = await c.req.json();
    const updated = updateProjectSettings(projectPath, body);
    return c.json(updated);
  });

  // ============================================================================
  // Planning Routes
  // ============================================================================

  api.get("/planning/status", async (c) => {
    const status = planningService.getStatus();
    return c.json(status);
  });

  api.post("/planning/start", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    try {
      planningService.startSession(projectPath);
      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to start" },
        500
      );
    }
  });

  api.post("/planning/end", async (c) => {
    planningService.endSession();
    return c.json({ success: true });
  });

  api.post("/planning/message", async (c) => {
    const projectPath = getProjectPath();
    if (!projectPath) {
      return c.json({ error: "No project found" }, 404);
    }

    const body = await c.req.json<{ message: string }>();

    if (!body.message) {
      return c.json({ error: "Message is required" }, 400);
    }

    // Ensure session is started
    if (!planningService.getStatus().active) {
      planningService.startSession(projectPath);
    }

    try {
      const result = await planningService.sendMessage(body.message);

      // Broadcast task update if tasks changed
      loopService.broadcastTaskUpdate();

      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to send" },
        500
      );
    }
  });

  api.get("/planning/messages", async (c) => {
    const messages = planningService.getMessages();
    return c.json(messages);
  });

  return api;
}
