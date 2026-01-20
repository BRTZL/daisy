/**
 * Shared types for Daisy
 */

// Task status from tasks.json
export type TaskStatus = "pending" | "passed" | "skipped";

// Section status from tasks.json
export type SectionStatus = "pending" | "completed" | "partial";

// Phase for tracking current loop state
export type Phase =
  | "selecting"
  | "implementing"
  | "testing"
  | "committing"
  | "done";

// Iteration status
export type IterationStatus = "running" | "completed" | "failed" | "stopped";

// Task item from tasks.json
export interface TaskItem {
  text: string;
  status: TaskStatus;
  note?: string;
}

// Section from tasks.json
export interface Section {
  id: number;
  name: string;
  status: SectionStatus;
  items: TaskItem[];
}

// Tasks file structure
export interface TasksFile {
  sections: Section[];
}

// Usage tracking
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

// Project configuration
export interface ProjectConfig {
  name?: string;
  maxIterations?: number;
  promptPath?: string;
}

// Iteration record
export interface Iteration {
  id: number;
  projectId: number;
  iterationNumber: number;
  startedAt: Date;
  completedAt: Date | null;
  status: IterationStatus;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  complete: boolean;
  errorMessage: string | null;
}

// Claude stream JSON output types
export interface StreamMessage {
  type: "init" | "assistant" | "result";
  data?: unknown;
}

export interface AssistantMessageData {
  content: string;
  model: string;
  stopReason?: string;
}

export interface ResultMessageData {
  complete: boolean;
  usage: TokenUsage;
  output?: string;
}

// Loop runner events
export interface LoopRunnerEvents {
  "iteration-start": (iteration: number) => void;
  "iteration-complete": (
    iteration: number,
    usage: TokenUsage,
    complete: boolean
  ) => void;
  "iteration-error": (iteration: number, error: Error) => void;
  output: (data: StreamMessage) => void;
  complete: () => void;
  error: (error: Error) => void;
}

/**
 * Base interface for loop runners (LoopRunner and OpenLoopRunner)
 * Both runners implement EventEmitter and have start/stop methods
 */
export interface BaseLoopRunner {
  start(): Promise<void>;
  stop(): void;
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter requires flexible function types
  on(event: string, listener: (...args: any[]) => void): this;
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter requires flexible function types
  off(event: string, listener: (...args: any[]) => void): this;
  // biome-ignore lint/suspicious/noExplicitAny: EventEmitter requires flexible function types
  emit(event: string, ...args: any[]): boolean;
}
