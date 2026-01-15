/**
 * Ralph Loop Runner - Manages continuous AI development loops with Claude Code
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type ParseResult, StreamParser } from "./parser.js";
import type { TokenUsage } from "./types.js";

export interface LoopRunnerOptions {
  projectPath: string;
  maxIterations: number;
  promptPath?: string;
  startingIteration?: number;
  onIterationStart?: (iteration: number) => void;
  onIterationComplete?: (
    iteration: number,
    usage: TokenUsage,
    complete: boolean
  ) => void;
  onIterationError?: (iteration: number, error: Error) => void;
  onOutput?: (data: ParseResult) => void;
  onStatusUpdate?: (status: StatusFile) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface StatusFile {
  sectionId: number;
  sectionName: string;
  phase: "selecting" | "implementing" | "testing" | "committing" | "done";
  message: string;
  itemsTotal: number;
  itemsCompleted: number;
}

export class LoopRunner extends EventEmitter {
  private activeProcess: ChildProcess | null = null;
  private parser = new StreamParser();
  private options: LoopRunnerOptions;
  private projectPath: string;
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
  private statusCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: LoopRunnerOptions) {
    super();
    this.options = options;
    this.projectPath = options.projectPath;
    this.maxIterations = options.maxIterations;
    this.startingIteration = options.startingIteration || 1;
  }

  /**
   * Start the Ralph loop
   */
  async start(): Promise<void> {
    console.log(`Starting Ralph loop: ${this.maxIterations} iterations`);
    console.log(`Project: ${this.projectPath}`);
    console.log();

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

      const complete = await this.runIteration(i);

      if (complete) {
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

    return new Promise((resolve) => {
      // Determine prompt path
      const defaultPromptPath = path.join(
        this.projectPath,
        ".ralph-looper",
        "PROMPT.md"
      );
      const promptPath = this.options.promptPath || defaultPromptPath;

      if (!existsSync(promptPath)) {
        const error = new Error(`Prompt file not found: ${promptPath}`);
        this.emit("error", error);
        this.options.onError?.(error);
        resolve(false);
        return;
      }

      // Spawn Claude Code
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
      let lastToolName = "";

      // Start checking for status updates every 5 seconds
      this.statusCheckInterval = setInterval(() => {
        this.checkStatusUpdates();
      }, 5000);

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
      this.activeProcess.on("close", (code) => {
        this.activeProcess = null;

        // Clear status check interval
        if (this.statusCheckInterval) {
          clearInterval(this.statusCheckInterval);
          this.statusCheckInterval = null;
        }

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

        this.emit("iteration-complete", iteration, this.currentUsage, complete);
        this.options.onIterationComplete?.(
          iteration,
          this.currentUsage,
          complete
        );

        resolve(complete);
      });

      // Handle errors
      this.activeProcess.on("error", (err) => {
        this.activeProcess = null;
        const error = new Error(`Failed to spawn claude: ${err.message}`);
        this.emit("error", error);
        this.options.onError?.(error);
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
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
    if (this.activeProcess) {
      console.log(chalkYellow("\nKilling Claude process..."));
      this.activeProcess.kill("SIGKILL");
      this.activeProcess = null;
    }
  }

  /**
   * Check for status updates
   */
  private checkStatusUpdates(): void {
    const statusPath = path.join(
      this.projectPath,
      ".ralph-looper",
      "status.json"
    );
    if (existsSync(statusPath)) {
      try {
        const statusData = JSON.parse(readFileSync(statusPath, "utf-8"));
        this.options.onStatusUpdate?.(statusData);
      } catch (_err) {
        // Ignore parsing errors
      }
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
