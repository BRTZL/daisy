/**
 * Planning Session Manager
 * Manages in-memory conversation history and structured JSON responses from Claude
 */

import chalk from "chalk";
import {
  formatTaskTree,
  getTasks,
  insertTask,
  removeTaskCascade,
  updateTask,
} from "../storage/project.js";
import type { Task } from "../storage/types.js";
import { PlanningChatManager } from "./planning-chat.js";
import { generatePlanningPrompt } from "./planning-prompt.js";
import {
  extractJsonFromResponse,
  type PlanningResponse,
  parsePlanningResponse,
} from "./planning-response.js";

// ============================================================================
// Types
// ============================================================================

export interface PlanningSessionOptions {
  /** Project path */
  projectPath: string;
  /** Project name */
  projectName: string;
  /** Path to spec file (if provided) */
  specFilePath?: string;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Maximum retries for invalid JSON (default: 2) */
  maxRetries?: number;
}

export interface PlanningSessionResult {
  /** Whether planning was completed (not cancelled) */
  completed: boolean;
  /** Final tasks (if completed) */
  tasks?: Task[];
  /** Summary from finalize_plan */
  summary?: string;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ============================================================================
// PlanningSession Class
// ============================================================================

/**
 * Manages a planning session with Claude using in-memory conversation history
 */
export class PlanningSession {
  private chatManager: PlanningChatManager;
  private projectPath: string;
  private projectName: string;
  private specFilePath: string | undefined;
  private timeout: number;
  private maxRetries: number;

  private messages: ConversationMessage[] = [];
  private systemPrompt: string;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private finalized = false;
  private summary: string | undefined;

  constructor(options: PlanningSessionOptions) {
    this.projectPath = options.projectPath;
    this.projectName = options.projectName;
    this.specFilePath = options.specFilePath;
    this.timeout = options.timeout ?? 300000; // 5 minutes default
    this.maxRetries = options.maxRetries ?? 2;

    this.chatManager = new PlanningChatManager({
      projectPath: options.projectPath,
    });

    // Generate system prompt once
    const existingTasks = getTasks(this.projectPath);
    this.systemPrompt = generatePlanningPrompt({
      projectName: this.projectName,
      projectPath: this.projectPath,
      specFilePath: this.specFilePath,
      existingTaskCount: existingTasks.length,
    });
  }

  /**
   * Send a message to Claude and get a structured response
   */
  async sendMessage(userMessage: string): Promise<PlanningResponse> {
    // Add user message to history
    this.messages.push({ role: "user", content: userMessage });

    // Build the full prompt with conversation history
    const fullPrompt = this.buildPrompt();

    // Try to get a valid response, with retries for invalid JSON
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let promptToSend = fullPrompt;

      // If this is a retry, add error feedback
      if (attempt > 0 && lastError) {
        promptToSend = `${fullPrompt}\n\n[SYSTEM: Your previous response was not valid JSON. Error: ${lastError}. Please respond with valid JSON only.]`;
      }

      try {
        // Call Claude
        const rawResponse = await this.chatManager.sendMessage(
          promptToSend,
          this.timeout
        );

        // Track tokens
        const stats = this.chatManager.getLastStats();
        if (stats) {
          this.totalInputTokens += stats.inputTokens;
          this.totalOutputTokens += stats.outputTokens;
          if (stats.totalCostUsd) {
            this.totalCostUsd += stats.totalCostUsd;
          }
        }

        // Extract and parse JSON
        const jsonString = extractJsonFromResponse(rawResponse);
        if (!jsonString) {
          lastError = "No JSON object found in response";
          continue;
        }

        const parseResult = parsePlanningResponse(jsonString);
        if (!parseResult.success) {
          lastError = parseResult.error;
          continue;
        }

        // Success! Add assistant response to history
        this.messages.push({ role: "assistant", content: rawResponse });

        // Process task operations
        const response = parseResult.data;
        if (response.tasks) {
          this.processTasks(response.tasks);
        }

        // Check if done
        if (response.done) {
          this.finalized = true;
          this.summary = response.summary;
        }

        return response;
      } catch (error) {
        lastError = (error as Error).message;
        if (attempt === this.maxRetries) {
          throw new Error(
            `Failed after ${this.maxRetries + 1} attempts: ${lastError}`
          );
        }
      }
    }

    // Should not reach here, but TypeScript needs this
    throw new Error(`Failed to get valid response: ${lastError}`);
  }

  /**
   * Build the full prompt including system prompt and conversation history
   */
  private buildPrompt(): string {
    const parts: string[] = [];

    // System prompt
    parts.push(this.systemPrompt);

    // Conversation history
    if (this.messages.length > 0) {
      parts.push("\n## Conversation History\n");

      for (const msg of this.messages) {
        if (msg.role === "user") {
          parts.push(`User: ${msg.content}`);
        } else {
          parts.push(`Assistant: ${msg.content}`);
        }
      }

      parts.push("\n## Current Request\n");
      parts.push(
        "Please respond to the user's last message with a valid JSON response."
      );
    }

    return parts.join("\n");
  }

  /**
   * Process task operations from Claude's response
   */
  private processTasks(tasks: NonNullable<PlanningResponse["tasks"]>): void {
    // Process additions
    if (tasks.add) {
      for (const taskOp of tasks.add) {
        const task: Task = {
          id: taskOp.id,
          title: taskOp.title,
          status: "pending",
          description: taskOp.description,
          dependsOn: taskOp.dependsOn,
          acceptanceCriteria: taskOp.acceptanceCriteria,
        };

        const result = insertTask(this.projectPath, task, taskOp.parentId, {
          afterId: taskOp.afterId,
          beforeId: taskOp.beforeId,
        });

        if (!result.success && process.env.DAISY_DEBUG) {
          console.error(chalk.yellow(`Warning: ${result.error}`));
        }
      }
    }

    // Process updates
    if (tasks.update) {
      for (const update of tasks.update) {
        const result = updateTask(this.projectPath, update.id, update.updates);

        if (!result.success && process.env.DAISY_DEBUG) {
          console.error(chalk.yellow(`Warning: ${result.error}`));
        }
      }
    }

    // Process removals
    if (tasks.remove) {
      for (const taskId of tasks.remove) {
        const result = removeTaskCascade(this.projectPath, taskId);

        if (!result.success && process.env.DAISY_DEBUG) {
          console.error(chalk.yellow(`Warning: ${result.error}`));
        }
      }
    }
  }

  /**
   * Get the current task summary as a formatted string
   */
  getTaskSummary(): string {
    const tasks = getTasks(this.projectPath);

    if (tasks.length === 0) {
      return chalk.gray("No tasks yet.");
    }

    return formatTaskTree(tasks, "tree");
  }

  /**
   * Get the current tasks
   */
  getTasks(): Task[] {
    return getTasks(this.projectPath);
  }

  /**
   * Get session statistics
   */
  getStats(): {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    taskCount: number;
  } {
    const tasks = this.getTasks();
    const countTasks = (taskList: Task[]): number => {
      let count = 0;
      for (const task of taskList) {
        count++;
        if (task.tasks) {
          count += countTasks(task.tasks);
        }
      }
      return count;
    };

    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd,
      taskCount: countTasks(tasks),
    };
  }

  /**
   * Check if the session has been finalized
   */
  isFinalized(): boolean {
    return this.finalized;
  }

  /**
   * Get the finalization summary
   */
  getSummary(): string | undefined {
    return this.summary;
  }

  /**
   * Set the summary (called externally if needed)
   */
  setSummary(summary: string): void {
    this.summary = summary;
  }

  /**
   * Cancel the current operation
   */
  cancel(): void {
    this.chatManager.cancel();
  }

  /**
   * Get the result of the planning session
   */
  getResult(): PlanningSessionResult {
    const tasks = this.getTasks();

    return {
      completed: this.finalized,
      tasks: tasks.length > 0 ? tasks : undefined,
      summary: this.summary,
    };
  }

  /**
   * Get the conversation history
   */
  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }
}
