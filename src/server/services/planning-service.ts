/**
 * Planning Service
 * Manages planning sessions for the web UI
 */

import { PlanningSession } from "../../core/planning-session.js";
import type { Task } from "../../storage/types.js";

export interface PlanningMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tasks?: {
    added?: string[];
    updated?: string[];
    removed?: string[];
  };
}

export interface PlanningStatus {
  active: boolean;
  projectPath: string | null;
  messageCount: number;
  stats: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    taskCount: number;
  };
}

export class PlanningService {
  private session: PlanningSession | null = null;
  private projectPath: string | null = null;
  private messages: PlanningMessage[] = [];
  private messageIdCounter = 0;

  /**
   * Start or continue a planning session for a project
   */
  startSession(projectPath: string): void {
    // If already have a session for this project, continue it
    if (this.session && this.projectPath === projectPath) {
      return;
    }

    // Create new session
    const projectName = projectPath.split("/").pop() || "unknown";
    this.session = new PlanningSession({
      projectPath,
      projectName,
    });
    this.projectPath = projectPath;
    this.messages = [];
    this.messageIdCounter = 0;
  }

  /**
   * End the current planning session
   */
  endSession(): void {
    if (this.session) {
      this.session.cancel();
    }
    this.session = null;
    this.projectPath = null;
    this.messages = [];
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(message: string): Promise<{
    response: string;
    tasks?: Task[];
    done?: boolean;
  }> {
    if (!this.session) {
      throw new Error("No active planning session");
    }

    // Add user message
    const userMsg: PlanningMessage = {
      id: `msg-${this.messageIdCounter++}`,
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(userMsg);

    try {
      // Send to Claude
      const response = await this.session.sendMessage(message);

      // Track task changes
      const taskChanges: PlanningMessage["tasks"] = {};
      if (response.tasks?.add) {
        taskChanges.added = response.tasks.add.map((t) => t.id);
      }
      if (response.tasks?.update) {
        taskChanges.updated = response.tasks.update.map((t) => t.id);
      }
      if (response.tasks?.remove) {
        taskChanges.removed = response.tasks.remove;
      }

      // Add assistant message
      const messageContent = response.message ?? "";
      const assistantMsg: PlanningMessage = {
        id: `msg-${this.messageIdCounter++}`,
        role: "assistant",
        content: messageContent,
        timestamp: new Date().toISOString(),
        tasks:
          Object.keys(taskChanges).length > 0 ? taskChanges : undefined,
      };
      this.messages.push(assistantMsg);

      return {
        response: messageContent,
        tasks: this.session.getTasks(),
        done: response.done,
      };
    } catch (error) {
      // Add error message
      const errorMsg: PlanningMessage = {
        id: `msg-${this.messageIdCounter++}`,
        role: "assistant",
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
      this.messages.push(errorMsg);

      throw error;
    }
  }

  /**
   * Get all messages in the current session
   */
  getMessages(): PlanningMessage[] {
    return [...this.messages];
  }

  /**
   * Get the current planning status
   */
  getStatus(): PlanningStatus {
    if (!this.session) {
      return {
        active: false,
        projectPath: null,
        messageCount: 0,
        stats: {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          taskCount: 0,
        },
      };
    }

    const stats = this.session.getStats();
    return {
      active: true,
      projectPath: this.projectPath,
      messageCount: this.messages.length,
      stats: {
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        costUsd: stats.totalCostUsd,
        taskCount: stats.taskCount,
      },
    };
  }

  /**
   * Check if session is finalized
   */
  isFinalized(): boolean {
    return this.session?.isFinalized() ?? false;
  }

  /**
   * Get current tasks
   */
  getTasks(): Task[] {
    return this.session?.getTasks() ?? [];
  }
}
