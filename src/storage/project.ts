import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULTS,
  FILES,
  type LoopSession,
  type ProjectConfig,
  type Signal,
  type SignalAction,
  type Task,
  type TaskSignalData,
  type TaskStatus,
  type TaskValidationResult,
} from "./types.js";

/**
 * Get the .daisy directory for a project
 */
export function getProjectDir(projectPath: string): string {
  return join(projectPath, ".daisy");
}

/**
 * Ensure the project's .daisy directory exists
 */
export function ensureProjectDir(projectPath: string): void {
  const dir = getProjectDir(projectPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if a path is an initialized daisy project
 */
export function isProject(projectPath: string): boolean {
  const configPath = join(getProjectDir(projectPath), FILES.projectConfig);
  return existsSync(configPath);
}

/**
 * Find the project root by searching up the directory tree.
 * Similar to how git finds .git directory.
 * Also checks DAISY_PROJECT_PATH env var for MCP server context.
 */
export function findProjectRoot(startPath?: string): string | null {
  // Check environment variable first (for MCP server context)
  const envPath = process.env.DAISY_PROJECT_PATH;
  if (envPath) {
    const resolved = resolve(envPath);
    if (isProject(resolved)) {
      return resolved;
    }
  }

  // Fall back to directory traversal
  let current = startPath || process.cwd();

  // Search up the directory tree
  while (current !== dirname(current)) {
    if (isProject(current)) {
      return current;
    }
    current = dirname(current);
  }

  // Check root as well
  if (isProject(current)) {
    return current;
  }

  return null;
}

// ============================================================================
// Config Management
// ============================================================================

/**
 * Get project configuration
 */
export function getConfig(projectPath: string): ProjectConfig {
  const configPath = join(getProjectDir(projectPath), FILES.projectConfig);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return {};
  }
}

/**
 * Save project configuration
 */
export function saveConfig(projectPath: string, config: ProjectConfig): void {
  ensureProjectDir(projectPath);
  const configPath = join(getProjectDir(projectPath), FILES.projectConfig);
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get a config value with defaults
 */
export function getConfigValue<K extends keyof ProjectConfig>(
  projectPath: string,
  key: K
): ProjectConfig[K] {
  const config = getConfig(projectPath);
  return config[key];
}

// ============================================================================
// Tasks Management
// ============================================================================

/**
 * Get all tasks for a project
 */
export function getTasks(projectPath: string): Task[] {
  const tasksPath = join(getProjectDir(projectPath), FILES.tasks);

  if (!existsSync(tasksPath)) {
    return [];
  }

  try {
    const content = readFileSync(tasksPath, "utf-8");
    return JSON.parse(content) as Task[];
  } catch {
    return [];
  }
}

/**
 * Save all tasks for a project
 */
export function saveTasks(projectPath: string, tasks: Task[]): void {
  ensureProjectDir(projectPath);
  const tasksPath = join(getProjectDir(projectPath), FILES.tasks);
  writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), "utf-8");
}

/**
 * Find a task by ID (recursive search)
 */
export function findTask(tasks: Task[], id: string): Task | null {
  for (const task of tasks) {
    if (task.id === id) {
      return task;
    }
    if (task.tasks) {
      const found = findTask(task.tasks, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Find a task and its parent array (for mutations)
 */
export function findTaskWithParent(
  tasks: Task[],
  id: string
): { task: Task; parent: Task[] } | null {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      return { task: tasks[i], parent: tasks };
    }
    const childTasks = tasks[i].tasks;
    if (childTasks) {
      const found = findTaskWithParent(childTasks, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  projectPath: string,
  taskId: string,
  status: TaskStatus,
  extra?: Partial<Pick<Task, "skipReason" | "completionSummary">>
): boolean {
  const tasks = getTasks(projectPath);
  const result = findTaskWithParent(tasks, taskId);

  if (!result) {
    return false;
  }

  result.task.status = status;
  result.task.updatedAt = new Date().toISOString();

  if (status === "completed") {
    result.task.completedAt = new Date().toISOString();
    if (extra?.completionSummary) {
      result.task.completionSummary = extra.completionSummary;
    }
  }

  if (status === "skipped" && extra?.skipReason) {
    result.task.skipReason = extra.skipReason;
  }

  saveTasks(projectPath, tasks);
  return true;
}

/**
 * Increment task attempts
 */
export function incrementTaskAttempts(
  projectPath: string,
  taskId: string
): number {
  const tasks = getTasks(projectPath);
  const result = findTaskWithParent(tasks, taskId);

  if (!result) {
    return -1;
  }

  result.task.attempts = (result.task.attempts || 0) + 1;
  result.task.updatedAt = new Date().toISOString();

  saveTasks(projectPath, tasks);
  return result.task.attempts;
}

/**
 * Add a new task (to root level or as child of existing task)
 */
export function addTask(
  projectPath: string,
  task: Task,
  parentId?: string
): boolean {
  const tasks = getTasks(projectPath);

  if (!task.createdAt) {
    task.createdAt = new Date().toISOString();
  }

  if (parentId) {
    const parent = findTaskWithParent(tasks, parentId);
    if (!parent) {
      return false;
    }
    if (!parent.task.tasks) {
      parent.task.tasks = [];
    }
    parent.task.tasks.push(task);
  } else {
    tasks.push(task);
  }

  saveTasks(projectPath, tasks);
  return true;
}

/**
 * Remove a task by ID
 */
export function removeTask(projectPath: string, taskId: string): boolean {
  const tasks = getTasks(projectPath);
  const removed = removeTaskFromArray(tasks, taskId);

  if (removed) {
    saveTasks(projectPath, tasks);
  }

  return removed;
}

/**
 * Helper: Remove task from nested array
 */
function removeTaskFromArray(tasks: Task[], id: string): boolean {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      tasks.splice(i, 1);
      return true;
    }
    const childTasks = tasks[i].tasks;
    if (childTasks) {
      if (removeTaskFromArray(childTasks, id)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get all tasks flattened (for iteration/counting)
 */
export function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];

  for (const task of tasks) {
    result.push(task);
    if (task.tasks) {
      result.push(...flattenTasks(task.tasks));
    }
  }

  return result;
}

/**
 * Check if a task's dependencies are all completed
 */
export function areDependenciesMet(tasks: Task[], task: Task): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return true;
  }

  const allTasks = flattenTasks(tasks);

  for (const depId of task.dependsOn) {
    const dep = allTasks.find((t) => t.id === depId);
    if (!dep || dep.status !== "completed") {
      return false;
    }
  }

  return true;
}

/**
 * Get the next available task to work on
 * (pending, dependencies met, not exceeded max attempts)
 */
export function getNextTask(projectPath: string): Task | null {
  const tasks = getTasks(projectPath);
  const config = getConfig(projectPath);
  const maxAttempts =
    config.loop?.maxAttemptsPerTask || DEFAULTS.maxAttemptsPerTask;

  const allTasks = flattenTasks(tasks);

  for (const task of allTasks) {
    // Skip if not pending
    if (task.status !== "pending") {
      continue;
    }

    // Skip if exceeded max attempts
    if ((task.attempts || 0) >= (task.maxAttempts || maxAttempts)) {
      continue;
    }

    // Skip if dependencies not met
    if (!areDependenciesMet(tasks, task)) {
      continue;
    }

    return task;
  }

  return null;
}

/**
 * Get task statistics
 */
export function getTaskStats(projectPath: string): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
  blocked: number;
} {
  const tasks = getTasks(projectPath);
  const allTasks = flattenTasks(tasks);

  return {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.status === "pending").length,
    inProgress: allTasks.filter((t) => t.status === "in_progress").length,
    completed: allTasks.filter((t) => t.status === "completed").length,
    skipped: allTasks.filter((t) => t.status === "skipped").length,
    blocked: allTasks.filter((t) => t.status === "blocked").length,
  };
}

// ============================================================================
// Current Working Directory Project Detection
// ============================================================================

/**
 * Simple project info returned from cwd detection
 */
export interface ProjectInfo {
  /** Absolute path to the project root */
  path: string;
  /** Project name (derived from folder name) */
  name: string;
}

/**
 * Get project info from the current working directory.
 * Returns null if cwd is not a valid daisy project.
 */
export function getCurrentProject(): ProjectInfo | null {
  const projectPath = findProjectRoot();

  if (!projectPath) {
    return null;
  }

  return {
    path: projectPath,
    name: projectPath.split("/").pop() || "unknown",
  };
}

/**
 * Require the current directory to be a valid project.
 * Exits with error message if not.
 */
export function requireProject(): ProjectInfo {
  const project = getCurrentProject();

  if (!project) {
    console.error("Not a daisy project. Run 'daisy init' to initialize.");
    process.exit(1);
  }

  return project;
}

// ============================================================================
// Planning Mode Functions
// ============================================================================

/**
 * Options for inserting a task
 */
export interface InsertTaskOptions {
  /** Insert after this task ID (at same level) */
  afterId?: string;
  /** Insert before this task ID (at same level) */
  beforeId?: string;
}

/**
 * Insert a task with optional positioning
 */
export function insertTask(
  projectPath: string,
  task: Task,
  parentId?: string,
  options?: InsertTaskOptions
): { success: boolean; error?: string } {
  const tasks = getTasks(projectPath);

  // Check for ID uniqueness
  if (findTask(tasks, task.id)) {
    return { success: false, error: `Task ID already exists: ${task.id}` };
  }

  // Validate dependencies exist
  if (task.dependsOn) {
    for (const depId of task.dependsOn) {
      if (!findTask(tasks, depId)) {
        return {
          success: false,
          error: `Dependency not found: ${depId}`,
        };
      }
    }
  }

  if (!task.createdAt) {
    task.createdAt = new Date().toISOString();
  }

  if (!task.status) {
    task.status = "pending";
  }

  if (parentId) {
    // Insert as child of parent
    const parent = findTaskWithParent(tasks, parentId);
    if (!parent) {
      return { success: false, error: `Parent task not found: ${parentId}` };
    }
    if (!parent.task.tasks) {
      parent.task.tasks = [];
    }

    const inserted = insertIntoArray(parent.task.tasks, task, options);
    if (!inserted) {
      return {
        success: false,
        error: "Failed to insert at specified position",
      };
    }
  } else {
    // Insert at root level
    const inserted = insertIntoArray(tasks, task, options);
    if (!inserted) {
      return {
        success: false,
        error: "Failed to insert at specified position",
      };
    }
  }

  saveTasks(projectPath, tasks);
  return { success: true };
}

/**
 * Helper to insert task into array with positioning
 */
function insertIntoArray(
  tasks: Task[],
  task: Task,
  options?: InsertTaskOptions
): boolean {
  if (options?.afterId) {
    const index = tasks.findIndex((t) => t.id === options.afterId);
    if (index === -1) return false;
    tasks.splice(index + 1, 0, task);
    return true;
  }

  if (options?.beforeId) {
    const index = tasks.findIndex((t) => t.id === options.beforeId);
    if (index === -1) return false;
    tasks.splice(index, 0, task);
    return true;
  }

  // Default: append to end
  tasks.push(task);
  return true;
}

/**
 * Update a task's properties (partial update)
 */
export function updateTask(
  projectPath: string,
  taskId: string,
  updates: Partial<
    Pick<Task, "title" | "description" | "dependsOn" | "acceptanceCriteria">
  >
): { success: boolean; error?: string } {
  const tasks = getTasks(projectPath);
  const result = findTaskWithParent(tasks, taskId);

  if (!result) {
    return { success: false, error: `Task not found: ${taskId}` };
  }

  // Validate new dependencies if provided
  if (updates.dependsOn) {
    for (const depId of updates.dependsOn) {
      if (!findTask(tasks, depId)) {
        return { success: false, error: `Dependency not found: ${depId}` };
      }
      // Prevent self-dependency
      if (depId === taskId) {
        return { success: false, error: "Task cannot depend on itself" };
      }
    }
  }

  // Apply updates
  if (updates.title !== undefined) {
    result.task.title = updates.title;
  }
  if (updates.description !== undefined) {
    result.task.description = updates.description;
  }
  if (updates.dependsOn !== undefined) {
    result.task.dependsOn = updates.dependsOn;
  }
  if (updates.acceptanceCriteria !== undefined) {
    result.task.acceptanceCriteria = updates.acceptanceCriteria;
  }

  result.task.updatedAt = new Date().toISOString();

  saveTasks(projectPath, tasks);
  return { success: true };
}

/**
 * Remove a task and all its subtasks
 */
export function removeTaskCascade(
  projectPath: string,
  taskId: string
): { success: boolean; removedCount: number; error?: string } {
  const tasks = getTasks(projectPath);
  const task = findTask(tasks, taskId);

  if (!task) {
    return {
      success: false,
      removedCount: 0,
      error: `Task not found: ${taskId}`,
    };
  }

  // Count subtasks
  const countSubtasks = (t: Task): number => {
    let count = 1;
    if (t.tasks) {
      for (const child of t.tasks) {
        count += countSubtasks(child);
      }
    }
    return count;
  };

  const removedCount = countSubtasks(task);

  // Remove from tree
  const removed = removeTaskFromArray(tasks, taskId);
  if (!removed) {
    return { success: false, removedCount: 0, error: "Failed to remove task" };
  }

  saveTasks(projectPath, tasks);
  return { success: true, removedCount };
}

/**
 * Validate the entire task tree
 */
export function validateTaskTree(projectPath: string): TaskValidationResult {
  const tasks = getTasks(projectPath);
  const errors: string[] = [];
  const warnings: string[] = [];
  const allTasks = flattenTasks(tasks);
  const taskIds = new Set<string>();

  // Check for duplicate IDs
  for (const task of allTasks) {
    if (taskIds.has(task.id)) {
      errors.push(`Duplicate task ID: ${task.id}`);
    }
    taskIds.add(task.id);
  }

  // Validate dependencies
  for (const task of allTasks) {
    if (task.dependsOn) {
      for (const depId of task.dependsOn) {
        if (!taskIds.has(depId)) {
          errors.push(
            `Task "${task.id}" depends on non-existent task "${depId}"`
          );
        }
        if (depId === task.id) {
          errors.push(`Task "${task.id}" cannot depend on itself`);
        }
      }
    }
  }

  // Check for circular dependencies
  const circularErrors = detectCircularDependencies(allTasks);
  errors.push(...circularErrors);

  // Warnings
  const orphanTasks = allTasks.filter(
    (t) =>
      t.status === "pending" &&
      (!t.dependsOn || t.dependsOn.length === 0) &&
      !isRootTask(tasks, t.id)
  );

  if (orphanTasks.length > 0 && allTasks.length > 1) {
    for (const task of orphanTasks) {
      warnings.push(
        `Task "${task.id}" has no dependencies - verify ordering is correct`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a task is at root level
 */
function isRootTask(tasks: Task[], taskId: string): boolean {
  return tasks.some((t) => t.id === taskId);
}

/**
 * Detect circular dependencies in task list
 */
function detectCircularDependencies(tasks: Task[]): string[] {
  const errors: string[] = [];
  const taskMap = new Map<string, Task>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(taskId: string, path: string[]): boolean {
    if (recursionStack.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      const cycle = [...path.slice(cycleStart), taskId];
      errors.push(`Circular dependency detected: ${cycle.join(" -> ")}`);
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task?.dependsOn) {
      for (const depId of task.dependsOn) {
        if (hasCycle(depId, [...path, taskId])) {
          return true;
        }
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      hasCycle(task.id, []);
    }
  }

  return errors;
}

/**
 * Format tasks as a tree string for display
 */
export function formatTaskTree(
  tasks: Task[],
  format: "tree" | "flat" | "summary" = "tree"
): string {
  if (format === "summary") {
    const allTasks = flattenTasks(tasks);
    const stats = {
      total: allTasks.length,
      pending: allTasks.filter((t) => t.status === "pending").length,
      completed: allTasks.filter((t) => t.status === "completed").length,
    };
    return `Total: ${stats.total} tasks (${stats.pending} pending, ${stats.completed} completed)`;
  }

  if (format === "flat") {
    const allTasks = flattenTasks(tasks);
    return allTasks.map((t) => `[${t.status}] ${t.id}: ${t.title}`).join("\n");
  }

  // Tree format
  function formatLevel(taskList: Task[], indent = ""): string {
    let result = "";
    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      const isLast = i === taskList.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      const statusIcon =
        task.status === "completed"
          ? "✓"
          : task.status === "in_progress"
            ? "●"
            : "○";

      result += `${indent}${prefix}${statusIcon} ${task.id}: ${task.title}\n`;

      if (task.tasks && task.tasks.length > 0) {
        const childIndent = indent + (isLast ? "    " : "│   ");
        result += formatLevel(task.tasks, childIndent);
      }
    }
    return result;
  }

  return formatLevel(tasks);
}

// ============================================================================
// Signal File Operations
// ============================================================================

/**
 * Read the current signal file
 */
export function readSignal(projectPath: string): Signal | null {
  const signalPath = join(getProjectDir(projectPath), FILES.signal);

  if (!existsSync(signalPath)) {
    return null;
  }

  try {
    const content = readFileSync(signalPath, "utf-8");
    return JSON.parse(content) as Signal;
  } catch {
    return null;
  }
}

/**
 * Write a signal file for inter-process communication
 */
export function writeSignal(
  projectPath: string,
  action: SignalAction,
  data?: TaskSignalData
): void {
  ensureProjectDir(projectPath);
  const signalPath = join(getProjectDir(projectPath), FILES.signal);
  const signal: Signal = {
    action,
    timestamp: new Date().toISOString(),
    data,
  };
  writeFileSync(signalPath, JSON.stringify(signal, null, 2));
}

/**
 * Clear the signal file
 */
export function clearSignal(projectPath: string): void {
  const signalPath = join(getProjectDir(projectPath), FILES.signal);
  if (existsSync(signalPath)) {
    writeFileSync(signalPath, "", "utf-8");
  }
}

// ============================================================================
// History Management
// ============================================================================

const HISTORY_FILE = "history.json";
const MAX_HISTORY_ENTRIES = 100;

/**
 * Get all session history for a project
 */
export function getHistory(projectPath: string): LoopSession[] {
  const historyPath = join(getProjectDir(projectPath), HISTORY_FILE);

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = readFileSync(historyPath, "utf-8");
    const data = JSON.parse(content);
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

/**
 * Save session history
 */
function saveHistory(projectPath: string, sessions: LoopSession[]): void {
  ensureProjectDir(projectPath);
  const historyPath = join(getProjectDir(projectPath), HISTORY_FILE);
  writeFileSync(
    historyPath,
    JSON.stringify({ sessions }, null, 2),
    "utf-8"
  );
}

/**
 * Add a new session to history
 */
export function addSession(
  projectPath: string,
  session: LoopSession
): void {
  const sessions = getHistory(projectPath);

  // Add new session at the beginning
  sessions.unshift(session);

  // Trim to max entries
  if (sessions.length > MAX_HISTORY_ENTRIES) {
    sessions.length = MAX_HISTORY_ENTRIES;
  }

  saveHistory(projectPath, sessions);
}

/**
 * Update an existing session in history
 */
export function updateSession(
  projectPath: string,
  sessionId: string,
  updates: Partial<LoopSession>
): boolean {
  const sessions = getHistory(projectPath);
  const index = sessions.findIndex((s) => s.id === sessionId);

  if (index === -1) {
    return false;
  }

  sessions[index] = { ...sessions[index], ...updates };
  saveHistory(projectPath, sessions);
  return true;
}

/**
 * Get a specific session by ID
 */
export function getSession(
  projectPath: string,
  sessionId: string
): LoopSession | null {
  const sessions = getHistory(projectPath);
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}
