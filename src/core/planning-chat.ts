/**
 * Planning Chat Manager
 * Simple Claude Code subprocess manager for planning sessions
 * No MCP, no session management - just send prompt, get response
 */

import { type ChildProcess, spawn } from "node:child_process";
import { StreamParser } from "./parser.js";

// ============================================================================
// Types
// ============================================================================

export interface PlanningChatManagerOptions {
  /** Project path (used for working directory context) */
  projectPath: string;
}

interface Stats {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd?: number;
}

// ============================================================================
// PlanningChatManager Class
// ============================================================================

/**
 * Manages Claude Code subprocess for planning chat
 * Each message spawns a new Claude process with the full prompt
 */
export class PlanningChatManager {
  private projectPath: string;
  private currentProcess: ChildProcess | null = null;
  private parser: StreamParser;
  private isProcessing = false;
  private lastStats: Stats | null = null;

  constructor(options: PlanningChatManagerOptions) {
    this.projectPath = options.projectPath;
    this.parser = new StreamParser();
  }

  /**
   * Check if currently processing a message
   */
  isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Get stats from the last message
   */
  getLastStats(): Stats | null {
    return this.lastStats;
  }

  /**
   * Send a message to Claude and get the response
   * @param fullPrompt - The complete prompt including system prompt and history
   * @param timeout - Timeout in milliseconds (default: 5 minutes)
   * @returns The raw response text from Claude
   */
  async sendMessage(fullPrompt: string, timeout = 300000): Promise<string> {
    if (this.isProcessing) {
      throw new Error("Already processing a message");
    }

    this.isProcessing = true;
    this.parser.clear();
    this.lastStats = null;

    return new Promise((resolve, reject) => {
      // Simple args: output format, verbose (required for stream-json with -p), and prompt from stdin
      const args = ["--output-format", "stream-json", "--verbose", "-p", "-"];

      const debug = process.env.DAISY_DEBUG;
      if (debug) {
        console.error("[DEBUG] Claude args:", args);
        console.error("[DEBUG] Project path:", this.projectPath);
        console.error("[DEBUG] Prompt length:", fullPrompt.length, "chars");
        console.error(
          "[DEBUG] Prompt preview:",
          `${fullPrompt.slice(0, 500)}...`
        );
      }

      const claudeProcess = spawn("claude", args, {
        cwd: this.projectPath,
        env: {
          ...process.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.currentProcess = claudeProcess;
      let responseText = "";
      let stderrBuffer = "";
      let stdoutBuffer = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCostUsd: number | undefined;
      let timedOut = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (this.currentProcess) {
          this.currentProcess.kill("SIGTERM");
          // Force kill after 5 seconds if SIGTERM doesn't work
          setTimeout(() => {
            if (this.currentProcess) {
              this.currentProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }, timeout);

      claudeProcess.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuffer += text;
        if (debug) {
          console.error("[DEBUG] stdout chunk:", text.slice(0, 200));
        }
        const results = this.parser.parse(text);

        for (const result of results) {
          // Track tokens from result messages
          if (result.type === "result") {
            totalInputTokens += result.inputTokens;
            totalOutputTokens += result.outputTokens;
            if (result.totalCostUsd !== undefined) {
              totalCostUsd = (totalCostUsd || 0) + result.totalCostUsd;
            }
          }

          // Collect response text
          if (result.text) {
            responseText += result.text;
          }
        }
      });

      claudeProcess.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuffer += text;
        if (debug) {
          console.error("[DEBUG] stderr chunk:", text);
        }
      });

      claudeProcess.on("error", (err) => {
        clearTimeout(timeoutId);
        this.isProcessing = false;
        this.currentProcess = null;
        reject(err);
      });

      claudeProcess.on("close", (code) => {
        clearTimeout(timeoutId);

        // Flush any remaining data in parser
        const finalResult = this.parser.flush();
        if (finalResult) {
          if (finalResult.type === "result") {
            totalInputTokens += finalResult.inputTokens;
            totalOutputTokens += finalResult.outputTokens;
            if (finalResult.totalCostUsd !== undefined) {
              totalCostUsd = (totalCostUsd || 0) + finalResult.totalCostUsd;
            }
          }
          if (finalResult.text) {
            responseText += finalResult.text;
          }
        }

        // Save stats
        this.lastStats = {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalCostUsd,
        };

        this.isProcessing = false;
        this.currentProcess = null;

        // Handle timeout
        if (timedOut) {
          reject(
            new Error(
              `Claude process timed out after ${timeout / 1000} seconds`
            )
          );
          return;
        }

        if (code !== 0 && code !== null) {
          console.error("[ERROR] Claude process failed");
          console.error("[ERROR] Exit code:", code);
          console.error("[ERROR] stderr:", stderrBuffer);
          console.error("[ERROR] stdout:", stdoutBuffer.slice(0, 1000));
          console.error("[ERROR] responseText:", responseText.slice(0, 500));
          reject(
            new Error(
              `Claude process exited with code ${code}: ${stderrBuffer}`
            )
          );
        } else {
          if (debug) {
            console.error("[DEBUG] Claude process succeeded");
            console.error("[DEBUG] responseText length:", responseText.length);
          }
          resolve(responseText);
        }
      });

      // Write the full prompt to stdin and close it
      if (debug) {
        console.error("[DEBUG] Writing prompt to stdin...");
      }
      claudeProcess.stdin?.write(fullPrompt);
      claudeProcess.stdin?.end();
      if (debug) {
        console.error("[DEBUG] Stdin closed, waiting for response...");
      }
    });
  }

  /**
   * Cancel the current message if processing
   */
  cancel(): void {
    if (this.currentProcess && this.isProcessing) {
      this.currentProcess.kill("SIGTERM");
      this.isProcessing = false;
      this.currentProcess = null;
    }
  }
}
