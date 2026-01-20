/**
 * Webhook event types and payload definitions
 */

/**
 * Events that can trigger webhook calls
 */
export type WebhookEvent =
  | "loop_started"
  | "loop_completed"
  | "iteration_started"
  | "iteration_completed"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "error";

/**
 * Payload sent to webhook endpoints
 */
export interface WebhookPayload {
  /** Event that triggered this webhook */
  event: WebhookEvent;
  /** ISO timestamp of the event */
  timestamp: string;
  /** Project information */
  project: {
    name: string;
    path: string;
  };
  /** Event-specific data */
  data: WebhookEventData;
}

/**
 * Event-specific data types
 */
export type WebhookEventData =
  | LoopStartedData
  | LoopCompletedData
  | IterationStartedData
  | IterationCompletedData
  | TaskStartedData
  | TaskCompletedData
  | TaskFailedData
  | ErrorData;

export interface LoopStartedData {
  maxIterations: number;
}

export interface LoopCompletedData {
  totalIterations: number;
  allTasksComplete: boolean;
  totalTokens: {
    input: number;
    output: number;
  };
  totalCost: number;
}

export interface IterationStartedData {
  iteration: number;
  maxIterations: number;
}

export interface IterationCompletedData {
  iteration: number;
  maxIterations: number;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  complete: boolean;
}

export interface TaskStartedData {
  taskId: string;
  taskTitle: string;
  iteration: number;
}

export interface TaskCompletedData {
  taskId: string;
  taskTitle: string;
  iteration: number;
  summary?: string;
}

export interface TaskFailedData {
  taskId: string;
  taskTitle: string;
  iteration: number;
  reason: string;
  attempts: number;
}

export interface ErrorData {
  message: string;
  iteration?: number;
}

/**
 * Result of a webhook delivery attempt
 */
export interface WebhookDeliveryResult {
  /** Webhook name */
  webhook: string;
  /** Whether delivery succeeded */
  success: boolean;
  /** HTTP status code (if request completed) */
  statusCode?: number;
  /** Error message (if delivery failed) */
  error?: string;
  /** Time taken in milliseconds */
  duration: number;
}
