/**
 * Open Loop Runner - Manages open-ended AI development loops without tasks
 *
 * Unlike LoopRunner which manages task queues, OpenLoopRunner is for continuous
 * development based on a prompt and activity log. Claude signals when done.
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

import { FILES, type Signal, type WebhookConfig } from "../storage/types.js";
import { type ParseResult, StreamParser } from "./parser.js";
import type { TokenUsage } from "./types.js";
import {
  createWebhookService,
  type WebhookService,
} from "./webhook-service.js";

export interface OpenLoopRunnerOptions {
  projectPath: string;
  projectName: string;
  maxIterations: number;
  promptPath?: string;
  startingIteration?: number;
  /** Pass --dangerously-skip-permissions to Claude Code */
  dangerouslySkipPermissions?: boolean;
  /** Suppress console output (let CLI handle display via events) */
  quiet?: boolean;
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

export class OpenLoopRunner extends EventEmitter {
  private activeProcess: ChildProcess | null = null;
  private parser = new StreamParser();
  private options: OpenLoopRunnerOptions;
  private projectPath: string;
  private projectName: string;
  private maxIterations: number;
  private startingIteration: number;
  private isStopping = false;
  private quiet: boolean;
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

  constructor(options: OpenLoopRunnerOptions) {
    super();
    this.options = options;
    this.projectPath = options.projectPath;
    this.projectName = options.projectName;
    this.maxIterations = options.maxIterations;
    this.startingIteration = options.startingIteration || 1;
    this.quiet = options.quiet || false;

    // Initialize webhook service if webhooks are configured
    this.webhookService = createWebhookService(
      options.webhooks,
      options.projectName,
      options.projectPath
    );
  }

  /**
   * Log to console (suppressed in quiet mode)
   */
  private log(...args: unknown[]): void {
    if (!this.quiet) {
      this.log(...args);
    }
  }

  /**
   * Start the open-ended Daisy loop
   */
  async start(): Promise<void> {
    this.log(
      `Starting open-ended Daisy loop: max ${this.maxIterations} iterations`
    );
    this.log(`Project: ${this.projectPath}`);
    if (this.options.dangerouslySkipPermissions) {
      this.log(
        chalkYellow("Warning: Running with --dangerously-skip-permissions")
      );
    }
    this.log();

    // Emit loop_started webhook
    await this.webhookService?.emit("loop_started", {
      maxIterations: this.maxIterations,
    });

    let loopComplete = false;

    for (
      let i = this.startingIteration;
      i < this.startingIteration + this.maxIterations;
      i++
    ) {
      if (this.isStopping) {
        this.log("\nLoop stopped by user");
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
        loopComplete = true;
        this.emit("complete");
        this.options.onComplete?.();
        this.log("\n✓ Loop completed by Claude!");
        break;
      }

      if (
        i < this.startingIteration + this.maxIterations - 1 &&
        !this.isStopping
      ) {
        this.log(
          `\nIteration ${i} complete. Pausing before next iteration...\n`
        );
        await this.sleep(2000); // 2 second pause between iterations
      }
    }

    // Emit loop_completed webhook
    await this.webhookService?.emit("loop_completed", {
      totalIterations: this.totalIterations,
      allTasksComplete: loopComplete,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
    });

    this.emit("done");
  }

  /**
   * Run a single iteration
   */
  private async runIteration(iteration: number): Promise<boolean> {
    this.log(
      chalkBlue(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    );
    this.log(
      chalkBlue(`Open Loop - Iteration ${iteration}/${this.maxIterations}`)
    );
    this.log(
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
      // Determine base prompt path
      const defaultPromptPath = path.join(
        this.projectPath,
        ".daisy",
        "PROMPT.md"
      );
      const basePromptPath = this.options.promptPath || defaultPromptPath;

      // Generate dynamic prompt with activity log context
      const promptPath = this.generateIterationPrompt(
        iteration,
        basePromptPath
      );

      // Build Claude command arguments
      const claudeArgs = [
        "-p",
        promptPath,
        "--output-format",
        "stream-json",
        "--print",
        "--verbose",
      ];

      // Add dangerously-skip-permissions flag if requested
      if (this.options.dangerouslySkipPermissions) {
        claudeArgs.push("--dangerously-skip-permissions");
      }

      // Spawn Claude Code
      this.activeProcess = spawn("claude", claudeArgs, {
        cwd: this.projectPath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let complete = false;
      let loopComplete = false;
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

              // Emit event for TUI to refresh
              this.emit("signal-received", signal);

              if (signal.action === "iteration_complete") {
                const signalData = signal.data as
                  | { reason?: string }
                  | undefined;
                this.log(
                  chalkGreen(
                    `\n✓ Signal received: ${signalData?.reason || "iteration complete"}`
                  )
                );
                complete = true;
                // Gracefully terminate Claude process
                if (this.activeProcess) {
                  this.activeProcess.kill("SIGTERM");
                }
              } else if (signal.action === "loop_complete") {
                const signalData = signal.data as
                  | { reason?: string }
                  | undefined;
                this.log(
                  chalkGreen(
                    `\n✓ Signal received: Loop complete - ${signalData?.reason || "work finished"}`
                  )
                );
                complete = true;
                loopComplete = true;
                if (this.activeProcess) {
                  this.activeProcess.kill("SIGTERM");
                }
              } else if (signal.action === "all_complete") {
                // Also handle all_complete for backwards compatibility
                this.log(chalkGreen(`\n✓ Signal received: All work complete!`));
                complete = true;
                loopComplete = true;
                if (this.activeProcess) {
                  this.activeProcess.kill("SIGTERM");
                }
              }
            } catch {
              // Ignore parse errors during file write
            }
          }
        });
      } catch {
        // Signal watching not critical, continue without it
        this.log(chalkYellow("Warning: Could not set up signal file watcher"));
      }

      // Parse stdout
      this.activeProcess.stdout?.on("data", (data: Buffer) => {
        const results = this.parser.parse(data.toString());

        for (const result of results) {
          this.emit("output", result);
          this.options.onOutput?.(result);

          // Handle different message types
          if (result.type === "init" && result.model) {
            this.log(`Model: ${result.model}`);
          }

          if (result.type === "assistant") {
            if (result.text) {
              // Text output - truncate for display
              const text =
                result.text.length > 200
                  ? `${result.text.substring(0, 200)}...`
                  : result.text;
              this.log(chalkGray(`Assistant: ${text}`));
            }
            if (result.toolName) {
              lastToolName = result.toolName;
              this.log(chalkCyan(`→ Tool: ${lastToolName}`));
            }
          }

          if (result.type === "result") {
            complete = result.isComplete;

            // Accumulate usage
            this.currentUsage.inputTokens += result.inputTokens;
            this.currentUsage.outputTokens += result.outputTokens;
            this.currentUsage.cacheCreateTokens += result.cacheCreateTokens;
            this.currentUsage.cacheReadTokens += result.cacheReadTokens;
            this.currentUsage.costUsd += result.totalCostUsd || 0;

            // Display usage
            this.log(
              chalkGray(
                `\nTokens: ${formatNumber(result.inputTokens)} in, ${formatNumber(result.outputTokens)} out`
              )
            );
            if (complete) {
              this.log(chalkGreen("\n✓ COMPLETE marker detected!"));
            }
          }
        }
      });

      // Handle stderr
      this.activeProcess.stderr?.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text) {
          this.log(chalkRed(`Error: ${text}`));
          this.emit("stderr", text);
        }
      });

      // Handle completion
      this.activeProcess.on("close", async (code) => {
        this.activeProcess = null;

        // Flush any remaining data in the parser buffer
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
            this.log(
              chalkGray(
                `\nTokens: ${formatNumber(finalResult.inputTokens)} in, ${formatNumber(finalResult.outputTokens)} out`
              )
            );
            if (complete) {
              this.log(chalkGreen("\n✓ COMPLETE marker detected!"));
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

        this.log(
          chalkBlue(`\nIteration ${iteration} ended (exit code: ${code})`)
        );
        this.log(
          chalkGray(
            `Total tokens: ${formatNumber(this.currentUsage.inputTokens)} in, ${formatNumber(this.currentUsage.outputTokens)} out`
          )
        );
        this.log(chalkGray(`Cost: $${this.currentUsage.costUsd.toFixed(4)}\n`));

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

        this.emit(
          "iteration-complete",
          iteration,
          this.currentUsage,
          loopComplete
        );
        this.options.onIterationComplete?.(
          iteration,
          this.currentUsage,
          loopComplete
        );

        // Return loopComplete - true means Claude signaled that all work is done
        resolve(loopComplete);
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
        this.log(chalkYellow("\nStopping iteration..."));
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
      this.log(chalkYellow("\nKilling Claude process..."));
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
   * Read the activity log file
   */
  private readActivityLog(): string {
    const activityPath = path.join(this.projectPath, ".daisy", "activity.md");
    if (existsSync(activityPath)) {
      try {
        return readFileSync(activityPath, "utf-8");
      } catch {
        return "";
      }
    }
    return "";
  }

  /**
   * Generate a dynamic prompt for the current iteration
   * Includes the base prompt and activity log for context
   */
  private generateIterationPrompt(
    iteration: number,
    basePromptPath: string
  ): string {
    // Read base prompt
    const basePrompt = existsSync(basePromptPath)
      ? readFileSync(basePromptPath, "utf-8")
      : "";

    // Read activity log
    const activityLog = this.readActivityLog();

    // Build the dynamic prompt
    const dynamicPrompt = `# Daisy Open Loop - Iteration ${iteration}

You are in an open-ended development loop. Work continuously based on the instructions below.

---

## Activity Log

Previous activity from this session:

---
${activityLog || "No previous activity recorded."}
---

## Instructions

1. Review the activity log above to understand what has been done
2. Continue working on the project based on the base instructions below
3. At the END of your work in this iteration, append a brief summary to \`.daisy/activity.md\`:
   - What you accomplished
   - What needs to be done next
   - Any decisions or blockers
4. Call \`signal_iteration_complete\` when ready for the next iteration
5. Call \`signal_iteration_complete\` with \`completeLoop: true\` when ALL work is done

## Activity Log Format

When appending to \`.daisy/activity.md\`, use this format:

\`\`\`markdown
## Iteration ${iteration} - ${new Date().toISOString()}
- Completed: [what you did]
- Next: [what needs to happen next]
- Notes: [any important observations]
\`\`\`

---

## Base Instructions

${basePrompt}
`;

    // Write to temp file
    const tempDir = path.join(this.projectPath, ".daisy", ".temp");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempPromptPath = path.join(
      tempDir,
      `open-loop-iteration-${iteration}-prompt.md`
    );
    writeFileSync(tempPromptPath, dynamicPrompt, "utf-8");

    return tempPromptPath;
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
