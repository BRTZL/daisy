/**
 * MCP Server for Daisy
 * Provides Model Context Protocol integration for Claude Code
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  findTask,
  flattenTasks,
  formatTaskTree,
  getCurrentProject,
  getNextTask,
  getProjectDir,
  getTaskStats,
  getTasks,
  insertTask,
  removeTaskCascade,
  updateTask,
  updateTaskStatus,
  validateTaskTree,
} from "../storage/project.js";
import { getProjectSettings } from "../storage/global.js";
import {
  FILES,
  type Signal,
  type SignalAction,
  type Task,
  type TaskSignalData,
  type TaskStatus,
} from "../storage/types.js";

interface ListTasksArgs {
  taskId?: string;
  status?: TaskStatus;
  flat?: boolean;
}

interface UpdateTaskStatusArgs {
  taskId: string;
  status: TaskStatus;
  skipReason?: string;
  completionSummary?: string;
}

interface StartIterationArgs {
  maxIterations?: number;
}

interface SignalIterationCompleteArgs {
  reason?: string;
  /** Set to true to signal that all work is complete and the loop should end */
  completeLoop?: boolean;
}

// Planning mode interfaces
interface AddTaskArgs {
  id: string;
  title: string;
  description?: string;
  parentId?: string;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  afterId?: string;
  beforeId?: string;
}

interface UpdatePlanTaskArgs {
  taskId: string;
  title?: string;
  description?: string;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
}

interface RemoveTaskArgs {
  taskId: string;
  reason?: string;
}

interface ListPlanTasksArgs {
  format?: "tree" | "flat" | "summary";
}

interface FinalizePlanArgs {
  summary: string;
}

/**
 * Write a signal file for TUI/Loop Runner communication
 */
function writeSignal(
  projectPath: string,
  action: SignalAction,
  data?: TaskSignalData
): void {
  const signalPath = join(getProjectDir(projectPath), FILES.signal);
  const signal: Signal = {
    action,
    timestamp: new Date().toISOString(),
    data,
  };
  writeFileSync(signalPath, JSON.stringify(signal, null, 2));
}

export function createMCPServer() {
  const server = new Server(
    {
      name: "daisy-mcp-server",
      version: "2.0.0",
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
          description: "List all tasks or filter by status/task ID",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: [
                  "pending",
                  "in_progress",
                  "completed",
                  "skipped",
                  "blocked",
                ],
                description: "Filter by task status",
              },
              taskId: {
                type: "string",
                description: "Get a specific task by ID (and its children)",
              },
              flat: {
                type: "boolean",
                description: "Return flattened list instead of hierarchy",
              },
            },
          },
        },
        {
          name: "get_next_task",
          description:
            "Get the next available task to work on (pending, dependencies met)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "update_task_status",
          description: "Update status of a specific task",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "Task ID",
              },
              status: {
                type: "string",
                enum: [
                  "pending",
                  "in_progress",
                  "completed",
                  "skipped",
                  "blocked",
                ],
                description: "New status",
              },
              skipReason: {
                type: "string",
                description: "Reason for skipping (when status is 'skipped')",
              },
              completionSummary: {
                type: "string",
                description:
                  "Summary of completion (when status is 'completed')",
              },
            },
            required: ["taskId", "status"],
          },
        },
        {
          name: "get_stats",
          description: "Get task and conversation statistics",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "start_iteration",
          description: "Start a new Daisy loop iteration (for advanced use)",
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
          name: "signal_iteration_complete",
          description:
            "Signal that the current task/milestone is complete and this iteration should end. Call this after completing a task or when ready for the next iteration. For open-ended loops, set completeLoop: true to signal that all work is done.",
          inputSchema: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description:
                  "Reason for ending iteration (e.g., 'task completed', 'blocked', 'needs review')",
              },
              completeLoop: {
                type: "boolean",
                description:
                  "Set to true to signal that all work is complete and the entire loop should end (for open-ended loops)",
              },
            },
          },
        },
        // Planning mode tools
        {
          name: "add_task",
          description:
            "Add a new task to the planning tree. Use during interactive planning sessions to build the task structure incrementally.",
          inputSchema: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Unique task identifier (e.g., 'setup-1', 'auth-1a')",
              },
              title: {
                type: "string",
                description: "Short, descriptive task title",
              },
              description: {
                type: "string",
                description: "Detailed description of what the task involves",
              },
              parentId: {
                type: "string",
                description:
                  "ID of parent task if this is a subtask (creates nesting)",
              },
              dependsOn: {
                type: "array",
                items: { type: "string" },
                description: "IDs of tasks that must complete before this one",
              },
              acceptanceCriteria: {
                type: "array",
                items: { type: "string" },
                description: "List of criteria for task completion",
              },
              afterId: {
                type: "string",
                description:
                  "Insert after this task ID (at same level, for ordering)",
              },
              beforeId: {
                type: "string",
                description:
                  "Insert before this task ID (at same level, for ordering)",
              },
            },
            required: ["id", "title"],
          },
        },
        {
          name: "update_plan_task",
          description:
            "Update an existing task's properties during planning. Use for partial updates - only specified fields are changed.",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "ID of the task to update",
              },
              title: {
                type: "string",
                description: "New title for the task",
              },
              description: {
                type: "string",
                description: "New description for the task",
              },
              dependsOn: {
                type: "array",
                items: { type: "string" },
                description: "New list of dependency task IDs",
              },
              acceptanceCriteria: {
                type: "array",
                items: { type: "string" },
                description: "New list of acceptance criteria",
              },
            },
            required: ["taskId"],
          },
        },
        {
          name: "remove_task",
          description:
            "Remove a task and all its subtasks from the plan. Use to restructure or correct the task tree.",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "ID of the task to remove",
              },
              reason: {
                type: "string",
                description: "Optional reason for removal",
              },
            },
            required: ["taskId"],
          },
        },
        {
          name: "list_plan_tasks",
          description:
            "Get current task structure during planning. Use to review what has been created so far.",
          inputSchema: {
            type: "object",
            properties: {
              format: {
                type: "string",
                enum: ["tree", "flat", "summary"],
                description:
                  "Output format: 'tree' (hierarchical), 'flat' (list), or 'summary' (counts only)",
              },
            },
          },
        },
        {
          name: "finalize_plan",
          description:
            "Finalize the planning session. Validates all tasks and dependencies, then signals completion to the TUI.",
          inputSchema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description:
                  "Summary of the planning session and created tasks",
              },
            },
            required: ["summary"],
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
          return await getCurrentProjectHandler();

        case "list_tasks":
          return await listTasks(args as unknown as ListTasksArgs | undefined);

        case "get_next_task":
          return await getNextTaskHandler();

        case "update_task_status":
          return await updateTaskStatusHandler(
            args as unknown as UpdateTaskStatusArgs
          );

        case "get_stats":
          return await getStats();

        case "start_iteration":
          return await startIteration(args as unknown as StartIterationArgs);

        case "signal_iteration_complete":
          return await signalIterationComplete(
            args as unknown as SignalIterationCompleteArgs
          );

        // Planning mode tools
        case "add_task":
          return await addTaskHandler(args as unknown as AddTaskArgs);

        case "update_plan_task":
          return await updatePlanTaskHandler(
            args as unknown as UpdatePlanTaskArgs
          );

        case "remove_task":
          return await removeTaskHandler(args as unknown as RemoveTaskArgs);

        case "list_plan_tasks":
          return await listPlanTasksHandler(
            args as unknown as ListPlanTasksArgs
          );

        case "finalize_plan":
          return await finalizePlanHandler(args as unknown as FinalizePlanArgs);

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

async function getCurrentProjectHandler() {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  // Get task stats
  const taskStats = getTaskStats(project.path);
  const settings = getProjectSettings(project.path);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            name: project.name,
            path: project.path,
            settings,
            stats: {
              tasks: taskStats,
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
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  let tasks = getTasks(project.path);

  // Filter by specific task ID
  if (args?.taskId) {
    const task = findTask(tasks, args.taskId);
    if (!task) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Task not found: ${args.taskId}` }),
          },
        ],
      };
    }
    tasks = [task];
  }

  // Flatten if requested
  if (args?.flat) {
    tasks = flattenTasks(tasks);
  }

  // Filter by status
  if (args?.status) {
    const filterTasks = (taskList: Task[]): Task[] => {
      return taskList.filter((t) => {
        if (t.status === args.status) return true;
        // For non-flat, still include parents that have matching children
        if (!args.flat && t.tasks && t.tasks.length > 0) {
          const filteredChildren = filterTasks(t.tasks);
          if (filteredChildren.length > 0) {
            t.tasks = filteredChildren;
            return true;
          }
        }
        return false;
      });
    };
    tasks = filterTasks(tasks);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(tasks, null, 2),
      },
    ],
  };
}

async function getNextTaskHandler() {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  const nextTask = getNextTask(project.path);

  if (!nextTask) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message:
              "No available tasks. All tasks may be completed, blocked, or have unmet dependencies.",
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(nextTask, null, 2),
      },
    ],
  };
}

async function updateTaskStatusHandler(args: UpdateTaskStatusArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  // Find the task first to get its title for the response
  const tasks = getTasks(project.path);
  const task = findTask(tasks, args.taskId);

  if (!task) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Task not found: ${args.taskId}` }),
        },
      ],
    };
  }

  // Update the task status
  const success = updateTaskStatus(project.path, args.taskId, args.status, {
    skipReason: args.skipReason,
    completionSummary: args.completionSummary,
  });

  if (!success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "Failed to update task status" }),
        },
      ],
    };
  }

  // Write signal file to notify TUI of task update
  writeSignal(project.path, "task_updated", {
    taskId: args.taskId,
    status: args.status,
    taskTitle: task.title,
  });

  // If task was completed, also signal iteration complete
  if (args.status === "completed") {
    // Check if all tasks are completed
    const stats = getTaskStats(project.path);
    if (stats.pending === 0 && stats.inProgress === 0) {
      writeSignal(project.path, "all_complete", {
        taskId: args.taskId,
        taskTitle: task.title,
        reason: "All tasks completed",
      });
    } else {
      writeSignal(project.path, "iteration_complete", {
        taskId: args.taskId,
        taskTitle: task.title,
        reason: `Task "${task.title}" completed`,
      });
    }
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Task "${task.title}" status updated to ${args.status}`,
        }),
      },
    ],
  };
}

async function getStats() {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  const taskStats = getTaskStats(project.path);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            tasks: taskStats,
          },
          null,
          2
        ),
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
            "To start iterations, use the CLI: daisy run " +
            (args.maxIterations || 10),
        }),
      },
    ],
  };
}

async function signalIterationComplete(args: SignalIterationCompleteArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  // Check if completeLoop is explicitly requested (for open-ended loops)
  if (args.completeLoop) {
    writeSignal(project.path, "loop_complete", {
      reason: args.reason || "Loop completed by request",
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Signaled loop complete. Loop will end.",
            action: "loop_complete",
          }),
        },
      ],
    };
  }

  // Check if all tasks are complete (for task-based loops)
  const stats = getTaskStats(project.path);
  const allComplete = stats.pending === 0 && stats.inProgress === 0;

  // Write the appropriate signal
  const action: SignalAction = allComplete
    ? "all_complete"
    : "iteration_complete";
  writeSignal(project.path, action, {
    reason:
      args.reason ||
      (allComplete ? "All tasks completed" : "Iteration complete"),
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: allComplete
            ? "Signaled all tasks complete. Loop will end."
            : "Signaled iteration complete. Moving to next iteration.",
          action,
        }),
      },
    ],
  };
}

// ============================================================================
// Planning Mode Tool Handlers
// ============================================================================

async function addTaskHandler(args: AddTaskArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  // Create the task object
  const task: Task = {
    id: args.id,
    title: args.title,
    status: "pending",
    description: args.description,
    dependsOn: args.dependsOn,
    acceptanceCriteria: args.acceptanceCriteria,
  };

  // Insert with optional positioning
  const result = insertTask(project.path, task, args.parentId, {
    afterId: args.afterId,
    beforeId: args.beforeId,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: result.error,
          }),
        },
      ],
    };
  }

  // Signal task update for TUI
  writeSignal(project.path, "task_updated", {
    taskId: args.id,
    taskTitle: args.title,
    reason: "Task added during planning",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Task "${args.id}" added successfully`,
          task: {
            id: args.id,
            title: args.title,
            parentId: args.parentId,
            dependsOn: args.dependsOn,
          },
        }),
      },
    ],
  };
}

async function updatePlanTaskHandler(args: UpdatePlanTaskArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  const updates: Partial<
    Pick<Task, "title" | "description" | "dependsOn" | "acceptanceCriteria">
  > = {};

  if (args.title !== undefined) updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.dependsOn !== undefined) updates.dependsOn = args.dependsOn;
  if (args.acceptanceCriteria !== undefined) {
    updates.acceptanceCriteria = args.acceptanceCriteria;
  }

  const result = updateTask(project.path, args.taskId, updates);

  if (!result.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: result.error,
          }),
        },
      ],
    };
  }

  // Signal task update for TUI
  writeSignal(project.path, "task_updated", {
    taskId: args.taskId,
    taskTitle: args.title,
    reason: "Task updated during planning",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Task "${args.taskId}" updated successfully`,
          updatedFields: Object.keys(updates),
        }),
      },
    ],
  };
}

async function removeTaskHandler(args: RemoveTaskArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  const result = removeTaskCascade(project.path, args.taskId);

  if (!result.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: result.error,
          }),
        },
      ],
    };
  }

  // Signal task update for TUI
  writeSignal(project.path, "task_updated", {
    taskId: args.taskId,
    reason: args.reason || "Task removed during planning",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: `Task "${args.taskId}" removed successfully`,
          removedCount: result.removedCount,
          reason: args.reason,
        }),
      },
    ],
  };
}

async function listPlanTasksHandler(args: ListPlanTasksArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  const tasks = getTasks(project.path);
  const format = args.format || "tree";
  const formatted = formatTaskTree(tasks, format);
  const stats = getTaskStats(project.path);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          format,
          taskCount: stats.total,
          tasks: format === "tree" ? formatted : undefined,
          taskList: format === "flat" ? formatted : undefined,
          summary: format === "summary" ? formatted : undefined,
          rawTasks: tasks,
        }),
      },
    ],
  };
}

async function finalizePlanHandler(args: FinalizePlanArgs) {
  const project = getCurrentProject();

  if (!project) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Not a daisy project. Run 'daisy init' first.",
          }),
        },
      ],
    };
  }

  // Validate the task tree
  const validation = validateTaskTree(project.path);

  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Task tree validation failed",
            errors: validation.errors,
            warnings: validation.warnings,
          }),
        },
      ],
    };
  }

  const stats = getTaskStats(project.path);

  // Write signal to indicate planning is complete
  writeSignal(project.path, "all_complete", {
    reason: `Planning finalized: ${args.summary}`,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          message: "Planning session finalized",
          summary: args.summary,
          taskCount: stats.total,
          warnings: validation.warnings,
        }),
      },
    ],
  };
}
