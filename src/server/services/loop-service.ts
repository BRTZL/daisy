/**
 * Loop Service
 * Unified service for managing loop execution (task-based and open-ended modes)
 * Broadcasts events to connected WebSocket clients
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, type FSWatcher, readFileSync, watch } from "node:fs";
import path from "node:path";

/**
 * Get the path to the claude binary
 */
function getClaudePath(): string {
  // Try which command first
  const result = spawnSync("which", ["claude"], {
    encoding: "utf-8",
  });

  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  // Common installation paths
  const commonPaths = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    path.join(process.env.HOME || "", ".npm-global/bin/claude"),
    path.join(process.env.HOME || "", ".local/bin/claude"),
  ];

  for (const claudePath of commonPaths) {
    if (existsSync(claudePath)) {
      return claudePath;
    }
  }

  // Fallback to just "claude" and hope PATH works
  return "claude";
}
import { StreamParser } from "../../core/parser.js";
import {
  addSession,
  generateSessionId,
  updateSession,
} from "../../storage/global.js";
import {
  clearSignal,
  flattenTasks,
  getNextTask,
  getTaskStats,
  getTasks,
  readSignal,
} from "../../storage/project.js";
import type { LoopSession } from "../../storage/types.js";

export interface LoopOptions {
  projectPath: string;
  maxIterations?: number;
  useTasks?: boolean;
  skipPermissions?: boolean;
}

export interface LoopStatus {
  running: boolean;
  iteration: number;
  maxIterations: number | null;
  mode: "task-based" | "open-ended";
  startedAt: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

interface WebSocketClient {
  send: (data: string) => void;
  readyState: number;
}

export class LoopService extends EventEmitter {
  private currentProcess: ChildProcess | null = null;
  private signalWatcher: FSWatcher | null = null;
  private parser: StreamParser;
  private clients: Set<WebSocketClient> = new Set();

  private status: LoopStatus = {
    running: false,
    iteration: 0,
    maxIterations: null,
    mode: "task-based",
    startedAt: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };

  private projectPath: string | null = null;
  private useTasks: boolean = true;
  private skipPermissions: boolean = false;
  private shouldStop: boolean = false;
  private currentSessionId: string | null = null;
  private tasksCompletedThisSession: string[] = [];

  constructor() {
    super();
    this.parser = new StreamParser();
  }

  /**
   * Register a WebSocket client for real-time updates
   */
  addClient(client: WebSocketClient): void {
    this.clients.add(client);
    // Send current status immediately
    this.sendToClient(client, { type: "loop-status", data: this.status });
    this.sendToClient(client, { type: "stats", data: this.getStats() });
  }

  /**
   * Remove a WebSocket client
   */
  removeClient(client: WebSocketClient): void {
    this.clients.delete(client);
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: { type: string; data: unknown }): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(
    client: WebSocketClient,
    message: { type: string; data: unknown }
  ): void {
    if (client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a log message
   */
  private log(
    text: string,
    level: "info" | "error" | "warning" | "success" = "info"
  ): void {
    this.broadcast({
      type: "log",
      data: { text, timestamp: new Date().toISOString(), level },
    });
  }

  /**
   * Broadcast task update notification
   */
  broadcastTaskUpdate(): void {
    this.broadcast({ type: "task-updated", data: null });
    this.broadcast({ type: "stats", data: this.getStats() });
  }

  /**
   * Get current loop status
   */
  getStatus(): LoopStatus {
    return { ...this.status };
  }

  /**
   * Get current task stats
   */
  private getStats() {
    if (!this.projectPath) {
      return {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        skipped: 0,
        blocked: 0,
      };
    }
    return getTaskStats(this.projectPath);
  }

  /**
   * Start the loop
   */
  async start(options: LoopOptions): Promise<void> {
    if (this.status.running) {
      throw new Error("Loop is already running");
    }

    this.projectPath = options.projectPath;
    this.useTasks = options.useTasks ?? true;
    this.skipPermissions = options.skipPermissions ?? false;
    this.shouldStop = false;
    this.tasksCompletedThisSession = [];

    // Reset status
    this.status = {
      running: true,
      iteration: 0,
      maxIterations: options.maxIterations ?? null,
      mode: this.useTasks ? "task-based" : "open-ended",
      startedAt: new Date().toISOString(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };

    // Create session for history
    this.currentSessionId = generateSessionId();
    const session: LoopSession = {
      id: this.currentSessionId,
      startedAt: this.status.startedAt!,
      completedAt: null,
      iterations: 0,
      mode: this.status.mode,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      tasksCompleted: [],
      status: "running",
    };
    addSession(this.projectPath, session);

    this.broadcast({ type: "loop-status", data: this.status });
    this.log(`Starting ${this.status.mode} loop...`, "info");

    // Run iterations
    let finalStatus: LoopSession["status"] = "completed";
    try {
      await this.runLoop();
    } catch (error) {
      finalStatus = "error";
      this.log(
        `Loop error: ${error instanceof Error ? error.message : String(error)}`,
        "error"
      );
      this.broadcast({ type: "error", data: { message: String(error) } });
    } finally {
      this.status.running = false;

      // Update session in history
      if (this.currentSessionId && this.projectPath) {
        updateSession(this.projectPath, this.currentSessionId, {
          completedAt: new Date().toISOString(),
          iterations: this.status.iteration,
          usage: this.status.usage,
          tasksCompleted: this.tasksCompletedThisSession,
          status: this.shouldStop ? "stopped" : finalStatus,
        });
      }
      this.currentSessionId = null;

      this.broadcast({ type: "loop-status", data: this.status });
      this.broadcast({ type: "loop-complete", data: { summary: this.status } });
      this.log("Loop finished", "success");
    }
  }

  /**
   * Stop the loop
   */
  stop(): void {
    this.shouldStop = true;
    if (this.currentProcess) {
      this.currentProcess.kill("SIGTERM");
      this.currentProcess = null;
    }
    if (this.signalWatcher) {
      this.signalWatcher.close();
      this.signalWatcher = null;
    }
    this.log("Loop stopped by user", "warning");
  }

  /**
   * Main loop execution
   */
  private async runLoop(): Promise<void> {
    while (!this.shouldStop) {
      // Check max iterations
      if (
        this.status.maxIterations &&
        this.status.iteration >= this.status.maxIterations
      ) {
        this.log(
          `Reached max iterations (${this.status.maxIterations})`,
          "info"
        );
        break;
      }

      // In task-based mode, check if there are tasks to do
      if (this.useTasks) {
        const nextTask = getNextTask(this.projectPath!);
        if (!nextTask) {
          this.log("All tasks completed!", "success");
          break;
        }
      }

      // Run iteration
      this.status.iteration++;
      this.broadcast({
        type: "iteration-start",
        data: {
          iteration: this.status.iteration,
          maxIterations: this.status.maxIterations,
        },
      });
      this.log(`Starting iteration ${this.status.iteration}...`, "info");

      const result = await this.runIteration();

      // Accumulate usage
      this.status.usage.inputTokens += result.inputTokens;
      this.status.usage.outputTokens += result.outputTokens;
      this.status.usage.costUsd += result.costUsd;

      this.broadcast({
        type: "iteration-complete",
        data: {
          iteration: this.status.iteration,
          usage: result,
          complete: result.loopComplete,
        },
      });

      this.broadcast({ type: "loop-status", data: this.status });
      this.broadcastTaskUpdate();

      if (result.loopComplete) {
        break;
      }

      // Pause between iterations
      if (!this.shouldStop) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * Run a single iteration
   */
  private async runIteration(): Promise<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    loopComplete: boolean;
  }> {
    return new Promise((resolve) => {
      const projectPath = this.projectPath!;
      let inputTokens = 0;
      let outputTokens = 0;
      let costUsd = 0;
      let loopComplete = false;

      // Clear previous signal
      clearSignal(projectPath);

      // Generate prompt
      const prompt = this.generatePrompt();

      // Build Claude args (MCP config is read from .mcp.json in project root)
      const args = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
      ];
      if (this.skipPermissions) {
        args.push("--dangerously-skip-permissions");
      }

      // Spawn Claude
      const claudePath = getClaudePath();
      const claude = spawn(claudePath, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          DAISY_PROJECT_PATH: projectPath,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.currentProcess = claude;
      this.parser.clear();

      // Watch for signal file changes
      let signalReceived = false;
      try {
        this.signalWatcher = watch(
          path.join(projectPath, ".daisy"),
          (_eventType, filename) => {
            if (filename === ".signal" && !signalReceived) {
              const signal = readSignal(projectPath);
              if (signal) {
                // Only act on iteration/loop completion signals, ignore task_updated
                if (
                  signal.action === "all_complete" ||
                  signal.action === "loop_complete"
                ) {
                  signalReceived = true;
                  loopComplete = true;
                  this.log(`Signal received: ${signal.action}`, "success");
                  // Kill Claude gracefully
                  if (this.currentProcess) {
                    this.currentProcess.kill("SIGTERM");
                  }
                } else if (signal.action === "iteration_complete") {
                  signalReceived = true;
                  this.log(`Signal received: iteration complete`, "info");
                  // Kill Claude gracefully
                  if (this.currentProcess) {
                    this.currentProcess.kill("SIGTERM");
                  }
                }
                // Ignore task_updated signals - let Claude continue working
              }
            }
          }
        );
      } catch {
        // Signal watching not critical
      }

      // Handle stdout
      claude.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const results = this.parser.parse(text);

        for (const result of results) {
          if (result.type === "result") {
            inputTokens += result.inputTokens;
            outputTokens += result.outputTokens;
            if (result.totalCostUsd) {
              costUsd += result.totalCostUsd;
            }
          }

          if (result.text) {
            this.log(result.text);
          }

          if (result.toolName) {
            // Include tool input for all tools to show params in UI
            if (result.toolInput) {
              this.log(
                `→ ${result.toolName}|${JSON.stringify(result.toolInput)}`,
                "info"
              );
            } else {
              this.log(`→ ${result.toolName}`, "info");
            }
          }
        }
      });

      // Handle stderr
      claude.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          this.log(text, "warning");
        }
      });

      // Handle close
      claude.on("close", (_code) => {
        this.currentProcess = null;

        if (this.signalWatcher) {
          this.signalWatcher.close();
          this.signalWatcher = null;
        }

        // Flush parser
        const finalResult = this.parser.flush();
        if (finalResult) {
          if (finalResult.type === "result") {
            inputTokens += finalResult.inputTokens;
            outputTokens += finalResult.outputTokens;
            if (finalResult.totalCostUsd) {
              costUsd += finalResult.totalCostUsd;
            }
          }
        }

        // Check signal one more time
        if (!signalReceived) {
          const signal = readSignal(projectPath);
          if (signal) {
            if (
              signal.action === "all_complete" ||
              signal.action === "loop_complete"
            ) {
              loopComplete = true;
            }
          }
        }

        resolve({ inputTokens, outputTokens, costUsd, loopComplete });
      });

      claude.on("error", (err) => {
        this.log(`Claude error: ${err.message}`, "error");
        resolve({ inputTokens, outputTokens, costUsd, loopComplete: false });
      });

      // Write prompt to stdin
      claude.stdin?.write(prompt);
      claude.stdin?.end();
    });
  }

  /**
   * Generate the iteration prompt
   */
  private generatePrompt(): string {
    const projectPath = this.projectPath!;

    // Read base prompt
    const promptPath = path.join(projectPath, ".daisy", "PROMPT.md");
    let basePrompt = "";
    if (existsSync(promptPath)) {
      basePrompt = readFileSync(promptPath, "utf-8");
    }

    if (this.useTasks) {
      return this.generateTaskPrompt(basePrompt);
    } else {
      return this.generateOpenPrompt(basePrompt);
    }
  }

  /**
   * Generate task-based prompt
   */
  private generateTaskPrompt(basePrompt: string): string {
    const projectPath = this.projectPath!;
    const tasks = getTasks(projectPath);
    const allTasks = flattenTasks(tasks);
    const stats = getTaskStats(projectPath);
    const nextTask = getNextTask(projectPath);

    // Build completed tasks section
    const completedTasks = allTasks
      .filter((t) => t.status === "completed")
      .map(
        (t) =>
          `- [x] ${t.id}: ${t.title}${t.completionSummary ? ` (${t.completionSummary})` : ""}`
      )
      .join("\n");

    // Build pending tasks section
    const pendingTasks = allTasks
      .filter((t) => t.status === "pending" && t.id !== nextTask?.id)
      .map((t) => `- [ ] ${t.id}: ${t.title}`)
      .join("\n");

    let prompt = `# Daisy Loop - Iteration ${this.status.iteration}

You are working in a Daisy autonomous development loop. You have access to the "daisy" MCP server which provides tools for task management and loop control.

## Available MCP Tools (from "daisy" server)

You MUST use these tools to manage tasks and signal completion:

### update_task_status
Update the status of a task. Call this when you complete or get blocked on a task.
- **taskId** (required): The task ID to update
- **status** (required): One of "pending", "in_progress", "completed", "skipped", "blocked"
- **completionSummary** (optional): Brief summary of what was done (for completed tasks)
- **skipReason** (optional): Reason for skipping (for skipped tasks)

Example: \`update_task_status({ taskId: "task-1", status: "completed", completionSummary: "Implemented login form" })\`

### signal_iteration_complete
Signal that this iteration is done and the loop should continue to the next iteration (or end).
- **reason** (optional): Why the iteration is ending
- **completeLoop** (optional): Set to true to end the entire loop (when all work is done)

Example: \`signal_iteration_complete({ reason: "Task completed" })\`

### get_next_task
Get the next available task to work on. Returns the next pending task with all dependencies met.

### list_tasks
List all tasks, optionally filtered by status.
- **status** (optional): Filter by status
- **flat** (optional): Return flattened list instead of hierarchy

### get_stats
Get task statistics (total, pending, completed, etc.)

## Task Statistics
- Total: ${stats.total}
- Completed: ${stats.completed}
- Pending: ${stats.pending}
- In Progress: ${stats.inProgress}
- Blocked: ${stats.blocked}

`;

    if (completedTasks) {
      prompt += `## Completed Tasks (DO NOT REDO)
${completedTasks}

`;
    }

    if (nextTask) {
      prompt += `## Current Task
**Task ID:** ${nextTask.id}
**Title:** ${nextTask.title}
${nextTask.description ? `**Description:** ${nextTask.description}` : ""}
${nextTask.acceptanceCriteria?.length ? `**Acceptance Criteria:**\n${nextTask.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}` : ""}
${nextTask.dependsOn?.length ? `**Dependencies:** ${nextTask.dependsOn.join(", ")}` : ""}

## Required Workflow
1. Work ONLY on task "${nextTask.id}"
2. When complete, call: \`update_task_status({ taskId: "${nextTask.id}", status: "completed", completionSummary: "..." })\`
3. If blocked, call: \`update_task_status({ taskId: "${nextTask.id}", status: "blocked" })\`
4. Finally, call: \`signal_iteration_complete()\`

`;
    } else {
      prompt += `## No Tasks Available
All tasks are either completed or blocked.

Call: \`signal_iteration_complete({ completeLoop: true })\`

`;
    }

    if (pendingTasks) {
      prompt += `## Remaining Tasks (DO NOT WORK ON YET)
${pendingTasks}

`;
    }

    prompt += `---

## Base Instructions

${basePrompt}
`;

    return prompt;
  }

  /**
   * Generate open-ended prompt
   */
  private generateOpenPrompt(basePrompt: string): string {
    const projectPath = this.projectPath!;

    // Read activity log
    const activityPath = path.join(projectPath, ".daisy", "activity.md");
    let activityLog = "No previous activity.";
    if (existsSync(activityPath)) {
      activityLog = readFileSync(activityPath, "utf-8");
    }

    return `# Daisy Open Loop - Iteration ${this.status.iteration}

You are in an open-ended development loop. Work continuously based on the instructions below.

## Activity Log

Previous activity from this session:

---
${activityLog}
---

## Instructions

1. Review the activity log to understand context
2. Continue working on the project goals below
3. At the END of your work, append a summary to \`.daisy/activity.md\`:
   - What you accomplished
   - What needs to be done next
   - Any decisions or blockers
4. Call \`signal_iteration_complete\` when ready for next iteration
5. Call \`signal_iteration_complete\` with \`completeLoop: true\` when ALL work is done

---

## Base Instructions

${basePrompt}
`;
  }
}
