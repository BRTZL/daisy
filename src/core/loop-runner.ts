/**
 * Daisy Loop Runner - Manages continuous AI development loops with Claude Code
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  type FSWatcher,
  mkdirSync,
  readFileSync,
  unlinkSync,
  watch,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  flattenTasks,
  getNextTask,
  getTaskStats,
  getTasks,
} from "../storage/project.js";
import { FILES, type Signal, type Task } from "../storage/types.js";
import type { WebhookConfig } from "../storage/global.js";
import { type ParseResult, StreamParser } from "./parser.js";
import type { TokenUsage } from "./types.js";
import {
  createWebhookService,
  type WebhookService,
} from "./webhook-service.js";

export interface LoopRunnerOptions {
  projectPath: string;
  projectName: string;
  maxIterations: number;
  promptPath?: string;
  startingIteration?: number;
  /** Webhook configurations for event notifications */
  webhooks?: WebhookConfig[];
  onIterationStart?: (iteration: number) => void;
  onIterationComplete?: (
    iteration: number,
    usage: TokenUsage,
    complete: boolean
  ) => void;
  onIterationError?: (iteration: number, error: Error) => void;
  onOutput?: (data: ParseResult) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export class LoopRunner extends EventEmitter {
  private activeProcess: ChildProcess | null = null;
  private parser = new StreamParser();
  private options: LoopRunnerOptions;
  private projectPath: string;
  private projectName: string;
  private maxIterations: number;
  private startingIteration: number;
  private isStopping = false;
  private currentUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
  };
  private webhookService: WebhookService | null = null;

  // Track totals across all iterations
  private totalTokens = { input: 0, output: 0 };
  private totalCost = 0;
  private totalIterations = 0;

  constructor(options: LoopRunnerOptions) {
    super();
    this.options = options;
    this.projectPath = options.projectPath;
    this.projectName = options.projectName;
    this.maxIterations = options.maxIterations;
    this.startingIteration = options.startingIteration || 1;

    // Initialize webhook service if webhooks are configured
    this.webhookService = createWebhookService(
      options.webhooks,
      options.projectName,
      options.projectPath
    );
  }

  /**
   * Start the Daisy loop
   */
  async start(): Promise<void> {
    console.log(`Starting Daisy loop: ${this.maxIterations} iterations`);
    console.log(`Project: ${this.projectPath}`);
    console.log();

    // Emit loop_started webhook
    await this.webhookService?.emit("loop_started", {
      maxIterations: this.maxIterations,
    });

    let allTasksComplete = false;

    for (
      let i = this.startingIteration;
      i < this.startingIteration + this.maxIterations;
      i++
    ) {
      if (this.isStopping) {
        console.log("\nLoop stopped by user");
        break;
      }

      this.emit("iteration-start", i);
      this.options.onIterationStart?.(i);

      // Emit iteration_started webhook
      await this.webhookService?.emit("iteration_started", {
        iteration: i,
        maxIterations: this.maxIterations,
      });

      const complete = await this.runIteration(i);

      // Track total iterations
      this.totalIterations++;

      if (complete) {
        allTasksComplete = true;
        this.emit("complete");
        this.options.onComplete?.();
        console.log("\n✓ All tasks completed!");
        break;
      }

      if (
        i < this.startingIteration + this.maxIterations - 1 &&
        !this.isStopping
      ) {
        console.log(
          `\nIteration ${i} complete. Pausing before next iteration...\n`
        );
        await this.sleep(2000); // 2 second pause between iterations
      }
    }

    // Emit loop_completed webhook
    await this.webhookService?.emit("loop_completed", {
      totalIterations: this.totalIterations,
      allTasksComplete,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
    });

    this.emit("done");
  }

  /**
   * Run a single iteration
   */
  private async runIteration(iteration: number): Promise<boolean> {
    console.log(
      chalkBlue(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    );
    console.log(chalkBlue(`Iteration ${iteration}/${this.maxIterations}`));
    console.log(
      chalkBlue(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    );

    // Reset usage for this iteration
    this.currentUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    };

    // Clear any existing signal file at the start of iteration
    const signalPath = path.join(this.projectPath, ".daisy", FILES.signal);
    if (existsSync(signalPath)) {
      try {
        unlinkSync(signalPath);
      } catch {
        // Ignore errors clearing signal file
      }
    }

    return new Promise((resolve) => {
      // Use static base prompt path for all iterations
      const promptPath = this.getPromptPath();

      // Get current task just for logging
      const currentTask = getNextTask(this.projectPath);

      // Log the current task being worked on
      if (currentTask) {
        console.log(
          chalkCyan(`Current task: ${currentTask.id} - ${currentTask.title}`)
        );
      } else {
        console.log(chalkYellow("No available tasks to work on"));
      }

      // Spawn Claude Code
      // Permissions are managed via .claude/settings.json (created by daisy init)
      this.activeProcess = spawn(
        "claude",
        [
          "-p",
          promptPath,
          "--output-format",
          "stream-json",
          "--print",
          "--verbose",
        ],
        {
          cwd: this.projectPath,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let complete = false;
      let allComplete = false;
      let lastToolName = "";
      let signalWatcher: FSWatcher | null = null;

      // Watch for signal file from MCP server
      try {
        const watchDir = path.join(this.projectPath, ".daisy");
        signalWatcher = watch(watchDir, (_eventType, filename) => {
          if (filename === FILES.signal && existsSync(signalPath)) {
            try {
              const content = readFileSync(signalPath, "utf-8");
              const signal: Signal = JSON.parse(content);

              // Emit event for TUI to refresh tasks
              this.emit("tasks-updated", signal.data);

              if (signal.action === "iteration_complete") {
                const taskData = signal.data as { reason?: string } | undefined;
                console.log(
                  chalkGreen(
                    `\n✓ Signal received: ${taskData?.reason || "iteration complete"}`
                  )
                );
                complete = true;
                // Gracefully terminate Claude process
                if (this.activeProcess) {
                  this.activeProcess.kill("SIGTERM");
                }
              } else if (signal.action === "all_complete") {
                console.log(
                  chalkGreen(`\n✓ Signal received: All tasks complete!`)
                );
                complete = true;
                allComplete = true;
                if (this.activeProcess) {
                  this.activeProcess.kill("SIGTERM");
                }
              } else if (signal.action === "task_updated") {
                const taskData = signal.data as
                  | { taskTitle?: string; status?: string }
                  | undefined;
                console.log(
                  chalkCyan(
                    `\n→ Task updated: ${taskData?.taskTitle} -> ${taskData?.status}`
                  )
                );
              }
            } catch {
              // Ignore parse errors during file write
            }
          }
        });
      } catch {
        // Signal watching not critical, continue without it
        console.log(
          chalkYellow("Warning: Could not set up signal file watcher")
        );
      }

      // Parse stdout
      this.activeProcess.stdout?.on("data", (data: Buffer) => {
        const results = this.parser.parse(data.toString());

        for (const result of results) {
          this.emit("output", result);
          this.options.onOutput?.(result);

          // Handle different message types
          if (result.type === "init" && result.model) {
            console.log(`Model: ${result.model}`);
          }

          if (result.type === "assistant") {
            if (result.text) {
              // Text output - truncate for display
              const text =
                result.text.length > 200
                  ? `${result.text.substring(0, 200)}...`
                  : result.text;
              console.log(chalkGray(`Assistant: ${text}`));
            }
            if (result.toolName) {
              lastToolName = result.toolName;
              console.log(chalkCyan(`→ Tool: ${lastToolName}`));
            }
          }

          if (result.type === "result") {
            complete = result.isComplete;

            // Debug: log result message parsing
            try {
              writeFileSync(
                "/tmp/daisy-runner-debug.log",
                `[${new Date().toISOString()}] result parsed: tokens=${result.inputTokens}/${result.outputTokens}, cost=${result.totalCostUsd}\n`,
                { flag: "a" }
              );
            } catch {}

            // Accumulate usage
            this.currentUsage.inputTokens += result.inputTokens;
            this.currentUsage.outputTokens += result.outputTokens;
            this.currentUsage.cacheCreateTokens += result.cacheCreateTokens;
            this.currentUsage.cacheReadTokens += result.cacheReadTokens;
            this.currentUsage.costUsd += result.totalCostUsd || 0;

            // Display usage
            console.log(
              chalkGray(
                `\nTokens: ${formatNumber(result.inputTokens)} in, ${formatNumber(result.outputTokens)} out`
              )
            );
            if (complete) {
              console.log(chalkGreen("\n✓ COMPLETE marker detected!"));
            }
          }
        }
      });

      // Handle stderr
      this.activeProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          console.error(chalkRed(`Error: ${text}`));
        }
      });

      // Handle completion
      this.activeProcess.on("close", async (code) => {
        this.activeProcess = null;

        // Flush any remaining data in the parser buffer (important for getting final result message)
        const finalResult = this.parser.flush();
        if (finalResult) {
          this.emit("output", finalResult);
          this.options.onOutput?.(finalResult);

          if (finalResult.type === "result") {
            complete = finalResult.isComplete;

            // Accumulate usage from final result
            this.currentUsage.inputTokens += finalResult.inputTokens;
            this.currentUsage.outputTokens += finalResult.outputTokens;
            this.currentUsage.cacheCreateTokens +=
              finalResult.cacheCreateTokens;
            this.currentUsage.cacheReadTokens += finalResult.cacheReadTokens;
            this.currentUsage.costUsd += finalResult.totalCostUsd || 0;

            // Display usage
            console.log(
              chalkGray(
                `\nTokens: ${formatNumber(finalResult.inputTokens)} in, ${formatNumber(finalResult.outputTokens)} out`
              )
            );
            if (complete) {
              console.log(chalkGreen("\n✓ COMPLETE marker detected!"));
            }
          }
        }

        // Close signal file watcher
        if (signalWatcher) {
          signalWatcher.close();
          signalWatcher = null;
        }

        // Update totals
        this.totalTokens.input += this.currentUsage.inputTokens;
        this.totalTokens.output += this.currentUsage.outputTokens;
        this.totalCost += this.currentUsage.costUsd;

        console.log(
          chalkBlue(`\nIteration ${iteration} ended (exit code: ${code})`)
        );
        console.log(
          chalkGray(
            `Total tokens: ${formatNumber(this.currentUsage.inputTokens)} in, ${formatNumber(this.currentUsage.outputTokens)} out`
          )
        );
        console.log(
          chalkGray(`Cost: $${this.currentUsage.costUsd.toFixed(4)}\n`)
        );

        // Emit iteration_completed webhook
        await this.webhookService?.emit("iteration_completed", {
          iteration,
          maxIterations: this.maxIterations,
          tokens: {
            input: this.currentUsage.inputTokens,
            output: this.currentUsage.outputTokens,
          },
          cost: this.currentUsage.costUsd,
          complete,
        });

        // Debug: log emitted values
        try {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(
            "/tmp/daisy-runner-debug.log",
            `[${new Date().toISOString()}] emit iteration-complete: iter=${iteration}, tokens=${this.currentUsage.inputTokens}/${this.currentUsage.outputTokens}, cost=${this.currentUsage.costUsd}, allComplete=${allComplete}\n`,
            { flag: "a" }
          );
        } catch {}

        this.emit(
          "iteration-complete",
          iteration,
          this.currentUsage,
          allComplete
        );
        this.options.onIterationComplete?.(
          iteration,
          this.currentUsage,
          allComplete
        );

        // Return allComplete (not complete) - complete means iteration done, allComplete means all tasks done
        resolve(allComplete);
      });

      // Handle errors
      this.activeProcess.on("error", async (err) => {
        this.activeProcess = null;

        // Close signal file watcher
        if (signalWatcher) {
          signalWatcher.close();
          signalWatcher = null;
        }

        const error = new Error(`Failed to spawn claude: ${err.message}`);
        this.emit("error", error);
        this.options.onError?.(error);
        // Emit error webhook
        await this.webhookService?.emit("error", {
          message: error.message,
          iteration,
        });
        resolve(false);
      });

      // Set up signal handlers for graceful shutdown
      const signalHandler = () => {
        console.log(chalkYellow("\nStopping iteration..."));
        this.stop();
      };

      process.on("SIGINT", signalHandler);
      process.on("SIGTERM", signalHandler);

      // Clean up signal handlers when iteration completes
      this.activeProcess.once("exit", () => {
        process.off("SIGINT", signalHandler);
        process.off("SIGTERM", signalHandler);
      });
    });
  }

  /**
   * Stop the loop
   */
  stop(): void {
    this.isStopping = true;
    if (this.activeProcess) {
      console.log(chalkYellow("\nKilling Claude process..."));
      this.activeProcess.kill("SIGKILL");
      this.activeProcess = null;
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the path to the base prompt file
   * Uses the same prompt for all iterations
   */
  private getPromptPath(): string {
    const defaultPromptPath = path.join(
      this.projectPath,
      ".daisy",
      "PROMPT.md"
    );
    return this.options.promptPath || defaultPromptPath;
  }
}

/**
 * Format a number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Color utilities
 */
function chalkColor(color: string, text: string): string {
  const colors: Record<string, string> = {
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    reset: "\x1b[0m",
  };
  return `${colors[color] || ""}${text}${colors.reset}`;
}

function chalkBlue(text: string): string {
  return chalkColor("blue", text);
}

function chalkCyan(text: string): string {
  return chalkColor("cyan", text);
}

function chalkGray(text: string): string {
  return chalkColor("gray", text);
}

function chalkGreen(text: string): string {
  return chalkColor("green", text);
}

function chalkRed(text: string): string {
  return chalkColor("red", text);
}

function chalkYellow(text: string): string {
  return chalkColor("yellow", text);
}
