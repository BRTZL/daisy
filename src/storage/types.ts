/**
 * Task status enum
 */
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "blocked";

/**
 * Recursive Task type - can contain children of same type
 * This is the core data structure for tasks.json
 */
export interface Task {
  /** Unique identifier (e.g., "setup", "auth-1") */
  id: string;
  /** Task title */
  title: string;
  /** Optional detailed description */
  description?: string;
  /** Current status */
  status: TaskStatus;
  /** IDs of tasks this depends on (must complete first) */
  dependsOn?: string[];
  /** List of criteria that must be met for completion */
  acceptanceCriteria?: string[];
  /** Number of times this task has been attempted */
  attempts?: number;
  /** Maximum attempts before auto-skip (default: 3) */
  maxAttempts?: number;
  /** Reason for skipping (if status is "skipped") */
  skipReason?: string;
  /** Summary of what was done (if status is "completed") */
  completionSummary?: string;
  /** ISO timestamp when created */
  createdAt?: string;
  /** ISO timestamp when last updated */
  updatedAt?: string;
  /** ISO timestamp when completed */
  completedAt?: string;
  /** Child tasks (recursive structure) */
  tasks?: Task[];
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Display name for the webhook */
  name: string;
  /** URL to send POST requests to */
  url: string;
  /** Events to trigger on (e.g., "task.completed", "milestone.completed") */
  events: string[];
  /** Whether the webhook is active */
  active: boolean;
  /** Optional secret for signing payloads */
  secret?: string;
}

/**
 * Project configuration stored in .daisy/config.json
 */
export interface ProjectConfig {
  /** Loop execution settings */
  loop?: {
    /** Maximum iterations per run */
    maxIterations?: number;
    /** Max attempts per task before skipping */
    maxAttemptsPerTask?: number;
  };
  /** Prompt template settings */
  prompt?: {
    /** Path to custom prompt template */
    templatePath?: string;
  };
  /** Configured webhooks */
  webhooks?: WebhookConfig[];
}

/**
 * Default values
 */
export const DEFAULTS = {
  maxIterations: 10,
  maxAttemptsPerTask: 3,
} as const;

/**
 * File names used in .daisy/
 */
export const FILES = {
  projectConfig: "config.json",
  tasks: "tasks.json",
  signal: ".signal",
} as const;

/**
 * Signal file actions for MCP-TUI communication
 */
export type SignalAction =
  | "task_updated"
  | "iteration_complete"
  | "all_complete"
  | "loop_complete";

/**
 * Base signal data for task-related signals
 */
export interface TaskSignalData {
  taskId?: string;
  status?: TaskStatus;
  taskTitle?: string;
  reason?: string;
}

/**
 * Signal file format for MCP-TUI communication
 */
export interface Signal {
  /** The action type */
  action: SignalAction;
  /** ISO timestamp when signal was written */
  timestamp: string;
  /** Optional data associated with the signal */
  data?: TaskSignalData;
}

/**
 * Planning session entry for transcript
 */
export interface PlanningEntry {
  /** Role: user or assistant */
  role: "user" | "assistant";
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: string;
  /** Tool calls made (for assistant entries) */
  toolCalls?: Array<{
    name: string;
    input: unknown;
    result?: unknown;
  }>;
}

/**
 * Planning session metadata
 */
export interface PlanningSession {
  /** Session ID (for Claude --resume) */
  sessionId: string;
  /** ISO timestamp when started */
  startedAt: string;
  /** ISO timestamp when ended */
  endedAt?: string;
  /** Path to spec file if provided */
  specFilePath?: string;
  /** Session status */
  status: "active" | "finalized" | "cancelled";
  /** Summary from finalize_plan */
  summary?: string;
}

/**
 * Task validation result
 */
export interface TaskValidationResult {
  /** Whether the task tree is valid */
  valid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Warnings (non-blocking issues) */
  warnings: string[];
}

/**
 * Loop session record for history tracking
 */
export interface LoopSession {
  /** Unique session ID */
  id: string;
  /** ISO timestamp when started */
  startedAt: string;
  /** ISO timestamp when completed */
  completedAt: string | null;
  /** Number of iterations run */
  iterations: number;
  /** Mode: task-based or open-ended */
  mode: "task-based" | "open-ended";
  /** Token usage and cost */
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  /** IDs of tasks completed during this session */
  tasksCompleted: string[];
  /** Final status */
  status: "running" | "completed" | "stopped" | "error";
}
