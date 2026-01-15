/**
 * MCP Server for Ralph Looper
 * Provides Model Context Protocol integration for Claude Code
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createDatabase, getGlobalDb } from "../db/index.js";
import * as queries from "../db/queries.js";

interface ListTasksArgs {
  sectionId?: number;
  status?: "pending" | "passed" | "skipped";
}

interface UpdateTaskStatusArgs {
  sectionId: number;
  itemIndex: number;
  status: "pending" | "passed" | "skipped";
  note?: string;
}

interface UpdateSectionStatusArgs {
  sectionId: number;
  status: "pending" | "completed" | "partial";
}

interface UpdateProgressArgs {
  sectionId: number;
  sectionName: string;
  phase: "selecting" | "implementing" | "testing" | "committing" | "done";
  message: string;
  itemsTotal: number;
  itemsCompleted: number;
}

interface StartIterationArgs {
  maxIterations?: number;
}

interface ToolArgs {
  [key: string]: unknown;
}

interface TaskItem {
  text: string;
  status: string;
  note: string | null;
}

interface SectionWithItems {
  id: number;
  name: string;
  status: string;
  items: TaskItem[];
}

export function createMCPServer() {
  const server = new Server(
    {
      name: "ralph-looper-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_current_project",
          description: "Get the current active project and its status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_tasks",
          description: "List all tasks or filter by status/section",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["pending", "passed", "skipped"],
                description: "Filter by task status",
              },
              sectionId: {
                type: "number",
                description: "Filter by section ID",
              },
            },
          },
        },
        {
          name: "get_task_status",
          description: "Get current progress status",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "update_task_status",
          description: "Update status of a specific task item",
          inputSchema: {
            type: "object",
            properties: {
              sectionId: {
                type: "number",
                description: "Section ID",
              },
              itemIndex: {
                type: "number",
                description: "Item index within section (0-based)",
              },
              status: {
                type: "string",
                enum: ["pending", "passed", "skipped"],
                description: "New status",
              },
              note: {
                type: "string",
                description: "Optional note for skipped items",
              },
            },
            required: ["sectionId", "itemIndex", "status"],
          },
        },
        {
          name: "update_section_status",
          description: "Update status of an entire section",
          inputSchema: {
            type: "object",
            properties: {
              sectionId: {
                type: "number",
                description: "Section ID",
              },
              status: {
                type: "string",
                enum: ["pending", "completed", "partial"],
                description: "New status",
              },
            },
            required: ["sectionId", "status"],
          },
        },
        {
          name: "update_progress",
          description: "Update current progress (phase, message, completion)",
          inputSchema: {
            type: "object",
            properties: {
              sectionId: {
                type: "number",
                description: "Current section ID",
              },
              sectionName: {
                type: "string",
                description: "Current section name",
              },
              phase: {
                type: "string",
                enum: [
                  "selecting",
                  "implementing",
                  "testing",
                  "committing",
                  "done",
                ],
                description: "Current phase",
              },
              message: {
                type: "string",
                description: "Status message",
              },
              itemsTotal: {
                type: "number",
                description: "Total items in section",
              },
              itemsCompleted: {
                type: "number",
                description: "Completed items",
              },
            },
            required: [
              "sectionId",
              "sectionName",
              "phase",
              "message",
              "itemsTotal",
              "itemsCompleted",
            ],
          },
        },
        {
          name: "start_iteration",
          description: "Start a new Ralph loop iteration (for advanced use)",
          inputSchema: {
            type: "object",
            properties: {
              maxIterations: {
                type: "number",
                description: "Maximum iterations to run",
              },
            },
          },
        },
        {
          name: "get_iteration_stats",
          description: "Get statistics for iterations and usage",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "get_current_project":
          return await getCurrentProject();

        case "list_tasks":
          return await listTasks(
            args ? (args as unknown as ListTasksArgs) : undefined
          );

        case "get_task_status":
          return await getTaskStatus();

        case "update_task_status":
          return await updateTaskStatus(
            args as unknown as UpdateTaskStatusArgs
          );

        case "update_section_status":
          return await updateSectionStatus(
            args as unknown as UpdateSectionStatusArgs
          );

        case "update_progress":
          return await updateProgress(args as unknown as UpdateProgressArgs);

        case "start_iteration":
          return await startIteration(args as unknown as StartIterationArgs);

        case "get_iteration_stats":
          return await getIterationStats(
            args ? (args as unknown as ToolArgs) : undefined
          );

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
      };
    }
  });

  return server;
}

// Tool implementations

async function getLocalProject(projectPath: string) {
  const { db: projectDb } = createDatabase(
    path.join(projectPath, ".ralph-looper", "database.sqlite")
  );
  const localProject = await queries.getProjectByPath(projectDb, projectPath);

  if (!localProject) {
    return null;
  }

  return { db: projectDb, project: localProject };
}

async function getCurrentProject() {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  // Get local project for stats
  const local = await getLocalProject(project.path);

  interface ProjectStats {
    sections: { total: number; completed: number; pending: number };
    items: {
      total: number;
      completed: number;
      pending: number;
      skipped: number;
    };
    iterations: { total: number; completed: number };
    usage: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheCreateTokens: number;
      totalCacheReadTokens: number;
      totalCostUsd: number | null;
      totalIterations: number;
    } | null;
  }

  const stats: ProjectStats = {
    sections: { total: 0, completed: 0, pending: 0 },
    items: { total: 0, completed: 0, pending: 0, skipped: 0 },
    iterations: { total: 0, completed: 0 },
    usage: null,
  };
  if (local) {
    const projectStats = await queries.getProjectStats(
      local.db,
      local.project.id
    );
    stats.sections = projectStats.sections;
    stats.items = projectStats.items;
    stats.iterations = projectStats.iterations;
    stats.usage = projectStats.usage;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            id: project.id,
            name: project.name,
            description: project.description,
            path: project.path,
            stats: {
              sections: stats.sections,
              items: stats.items,
              iterations: stats.iterations,
              usage: stats.usage,
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

async function listTasks(args: ListTasksArgs | undefined) {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  const local = await getLocalProject(project.path);
  if (!local) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No local project found" }),
        },
      ],
    };
  }

  const sections = await queries.getSectionsByProject(
    local.db,
    local.project.id
  );

  const result: SectionWithItems[] = [];

  for (const section of sections) {
    // Skip section if it doesn't match filter
    if (args?.sectionId && section.externalId !== args.sectionId) {
      continue;
    }

    const items = await queries.getItemsBySection(local.db, section.id);
    const filteredItems = args?.status
      ? items.filter((i) => i.status === args.status)
      : items;

    result.push({
      id: section.externalId,
      name: section.name,
      status: section.status,
      items: filteredItems.map((item) => ({
        text: item.text,
        status: item.status,
        note: item.note,
      })),
    });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

async function getTaskStatus() {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  const statusPath = path.join(project.path, ".ralph-looper", "status.json");

  if (!existsSync(statusPath)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No status file found" }),
        },
      ],
    };
  }

  const statusData = JSON.parse(
    require("node:fs").readFileSync(statusPath, "utf-8")
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(statusData, null, 2),
      },
    ],
  };
}

async function updateTaskStatus(args: UpdateTaskStatusArgs) {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  const local = await getLocalProject(project.path);
  if (!local) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No local project found" }),
        },
      ],
    };
  }

  // Get section by external ID
  const section = await queries.getSectionByExternalId(
    local.db,
    local.project.id,
    args.sectionId
  );
  if (!section) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "Section not found" }),
        },
      ],
    };
  }

  // Get items in section
  const items = await queries.getItemsBySection(local.db, section.id);
  const item = items[args.itemIndex];

  if (!item) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "Item not found" }),
        },
      ],
    };
  }

  // Update item status
  await queries.updateItemStatus(local.db, item.id, args.status, args.note);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Task "${item.text}" status updated to ${args.status}`,
        }),
      },
    ],
  };
}

async function updateSectionStatus(args: UpdateSectionStatusArgs) {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  const local = await getLocalProject(project.path);
  if (!local) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No local project found" }),
        },
      ],
    };
  }

  // Get section by external ID
  const section = await queries.getSectionByExternalId(
    local.db,
    local.project.id,
    args.sectionId
  );
  if (!section) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "Section not found" }),
        },
      ],
    };
  }

  // Update section status
  await queries.updateSection(local.db, section.id, { status: args.status });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Section "${section.name}" status updated to ${args.status}`,
        }),
      },
    ],
  };
}

async function updateProgress(args: UpdateProgressArgs) {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  // Update status.json file
  const statusPath = path.join(project.path, ".ralph-looper", "status.json");
  const statusData = {
    sectionId: args.sectionId,
    sectionName: args.sectionName,
    phase: args.phase,
    message: args.message,
    itemsTotal: args.itemsTotal,
    itemsCompleted: args.itemsCompleted,
  };

  require("node:fs").writeFileSync(
    statusPath,
    JSON.stringify(statusData, null, 2)
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Progress updated",
        }),
      },
    ],
  };
}

async function startIteration(args: StartIterationArgs) {
  // This is a placeholder for starting iterations programmatically
  // In practice, users should use the CLI command
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          message:
            "To start iterations, use the CLI: ralph-looper run " +
            (args.maxIterations || 10),
        }),
      },
    ],
  };
}

async function getIterationStats(_args?: ToolArgs) {
  const db = getGlobalDb();
  const project = await queries.getActiveProject(db);

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No active project found" }),
        },
      ],
    };
  }

  const local = await getLocalProject(project.path);
  if (!local) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "No local project found" }),
        },
      ],
    };
  }

  const iterations = await queries.getIterationsByProject(
    local.db,
    local.project.id
  );
  const usage = await queries.getUsageByProject(local.db, local.project.id);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            totalIterations: iterations.length,
            completedIterations: iterations.filter(
              (i) => i.status === "completed"
            ).length,
            latestIteration: iterations[0] || null,
            usage: usage
              ? {
                  totalInputTokens: usage.totalInputTokens,
                  totalOutputTokens: usage.totalOutputTokens,
                  totalCacheCreateTokens: usage.totalCacheCreateTokens,
                  totalCacheReadTokens: usage.totalCacheReadTokens,
                  totalCostUsd: usage.totalCostUsd,
                  totalIterations: usage.totalIterations,
                }
              : null,
          },
          null,
          2
        ),
      },
    ],
  };
}
