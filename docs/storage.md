# Storage Layer

Daisy uses a file-based storage system with JSON files for persistence. There is no database - all data is stored in human-readable files.

## Overview

The storage layer:
- Persists data in JSON files
- Provides CRUD operations for tasks
- Handles recursive task trees
- Validates task dependencies
- Tracks session history
- Manages signal files for IPC

## File Locations

### Project Files

All project-specific files are in `.daisy/`:

```
project/
└── .daisy/
    ├── config.json       # Project configuration
    ├── tasks.json        # Task definitions
    ├── history.json      # Session history
    ├── PROMPT.md         # Base prompt template
    ├── plans/            # Planning session data
    ├── .signal           # IPC signal file
    ├── .temp/            # Temporary files
    │   └── iteration-N-prompt.md
    └── activity.md       # Open-loop activity log
```

### Global Files

```
~/.daisy/
└── projects.json         # Known projects and current selection
```

## File Formats

### tasks.json

Recursive task tree stored as JSON array.

```json
[
  {
    "id": "setup",
    "title": "Project Setup",
    "description": "Initialize project infrastructure",
    "status": "completed",
    "acceptanceCriteria": [
      "Database running",
      "Config files created"
    ],
    "createdAt": "2024-01-15T09:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:30:00.000Z",
    "completionSummary": "Set up PostgreSQL and created initial schema",
    "tasks": [
      {
        "id": "setup-db",
        "title": "Database Setup",
        "status": "completed",
        "completedAt": "2024-01-15T10:00:00.000Z"
      },
      {
        "id": "setup-config",
        "title": "Configuration",
        "status": "completed",
        "dependsOn": ["setup-db"],
        "completedAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  },
  {
    "id": "auth",
    "title": "Authentication",
    "status": "pending",
    "dependsOn": ["setup"],
    "tasks": [
      {
        "id": "auth-login",
        "title": "Login Endpoint",
        "status": "pending"
      },
      {
        "id": "auth-logout",
        "title": "Logout Endpoint",
        "status": "pending",
        "dependsOn": ["auth-login"]
      }
    ]
  }
]
```

#### Task Schema

```typescript
interface Task {
  // Required
  id: string;                    // Pattern: ^[a-zA-Z0-9_-]+$
  title: string;                 // Min length: 1
  status: TaskStatus;

  // Optional
  description?: string;
  dependsOn?: string[];          // Task IDs
  acceptanceCriteria?: string[];
  tasks?: Task[];                // Nested subtasks

  // Attempt tracking
  attempts?: number;             // >= 0
  maxAttempts?: number;          // >= 1, default 3

  // Status metadata
  skipReason?: string;
  completionSummary?: string;

  // Timestamps (ISO 8601)
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "blocked";
```

### config.json

Project configuration.

```json
{
  "loop": {
    "maxIterations": 10,
    "maxAttemptsPerTask": 3
  },
  "prompt": {
    "templatePath": "custom/PROMPT.md"
  },
  "webhooks": [
    {
      "name": "Slack Notifications",
      "url": "https://hooks.slack.com/services/...",
      "events": ["task_completed", "loop_completed", "error"],
      "active": true,
      "secret": "hmac-signing-secret"
    }
  ]
}
```

#### Config Schema

```typescript
interface ProjectConfig {
  loop?: {
    maxIterations?: number;      // Min: 1
    maxAttemptsPerTask?: number; // Min: 1
  };
  prompt?: {
    templatePath?: string;       // Custom prompt location
  };
  webhooks?: WebhookConfig[];
}

interface WebhookConfig {
  name: string;
  url: string;                   // HTTPS endpoint
  events: WebhookEvent[];
  active: boolean;
  secret?: string;               // HMAC-SHA256 signing secret
}

type WebhookEvent =
  | "loop_started"
  | "loop_completed"
  | "iteration_started"
  | "iteration_completed"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "error";
```

### history.json

Session history (max 100 entries).

```json
{
  "sessions": [
    {
      "id": "session-h1z2y3-abc123",
      "startedAt": "2024-01-15T10:00:00.000Z",
      "completedAt": "2024-01-15T11:30:00.000Z",
      "iterations": 15,
      "mode": "task-based",
      "usage": {
        "inputTokens": 150000,
        "outputTokens": 45000,
        "costUsd": 2.45
      },
      "tasksCompleted": ["setup", "setup-db", "setup-config", "auth-login"],
      "status": "completed"
    }
  ]
}
```

#### Session Schema

```typescript
interface LoopSession {
  id: string;                    // Format: session-{base36}-{random}
  startedAt: string;            // ISO 8601
  completedAt: string | null;
  iterations: number;
  mode: "task-based" | "open-ended";
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  tasksCompleted: string[];     // Task IDs
  status: SessionStatus;
}

type SessionStatus =
  | "running"
  | "completed"
  | "stopped"
  | "error";
```

### .signal

IPC signal file for Loop Runner communication.

```json
{
  "action": "iteration_complete",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "taskId": "auth-login",
    "status": "completed",
    "taskTitle": "Login Endpoint"
  }
}
```

#### Signal Schema

```typescript
interface Signal {
  action: SignalAction;
  timestamp: string;            // ISO 8601
  data?: TaskSignalData;
}

type SignalAction =
  | "task_updated"
  | "iteration_complete"
  | "all_complete"
  | "loop_complete";

interface TaskSignalData {
  taskId?: string;
  status?: TaskStatus;
  taskTitle?: string;
  reason?: string;
}
```

### projects.json (Global)

Known projects list.

```json
{
  "projects": [
    "/Users/you/project-a",
    "/Users/you/project-b"
  ],
  "current": "/Users/you/project-a"
}
```

## Storage Operations

### Project Operations

```typescript
// Get project directory path
getProjectDir(projectPath: string): string

// Ensure .daisy directory exists
ensureProjectDir(projectPath: string): void

// Check if path is a Daisy project
isProject(projectPath: string): boolean

// Find project root from any subdirectory
findProjectRoot(startPath?: string): string | null

// Get current project info
getCurrentProject(): ProjectInfo | null

// Require project (throws if not found)
requireProject(): ProjectInfo
```

### Configuration Operations

```typescript
// Read configuration
getConfig(projectPath: string): ProjectConfig

// Get specific config value
getConfigValue<K extends keyof ProjectConfig>(
  projectPath: string,
  key: K
): ProjectConfig[K]

// Save configuration
saveConfig(projectPath: string, config: ProjectConfig): void
```

### Task CRUD Operations

```typescript
// Read all tasks
getTasks(projectPath: string): Task[]

// Save all tasks
saveTasks(projectPath: string, tasks: Task[]): void

// Find task by ID (recursive)
findTask(tasks: Task[], id: string): Task | null

// Find task with parent array reference
findTaskWithParent(tasks: Task[], id: string): {
  task: Task;
  parent: Task[];
} | null

// Add task (simple)
addTask(projectPath: string, task: Task, parentId?: string): boolean

// Insert task with positioning and validation
insertTask(
  projectPath: string,
  task: Task,
  parentId?: string,
  options?: { afterId?: string; beforeId?: string }
): { success: boolean; error?: string }

// Update task properties
updateTask(
  projectPath: string,
  taskId: string,
  updates: Partial<{
    title: string;
    description: string;
    dependsOn: string[];
    acceptanceCriteria: string[];
  }>
): { success: boolean; error?: string }

// Remove single task
removeTask(projectPath: string, taskId: string): boolean

// Remove task and all subtasks
removeTaskCascade(projectPath: string, taskId: string): {
  success: boolean;
  removedCount: number;
  error?: string;
}
```

### Task Status Operations

```typescript
// Update task status
updateTaskStatus(
  projectPath: string,
  taskId: string,
  status: TaskStatus,
  extra?: {
    skipReason?: string;
    completionSummary?: string;
  }
): boolean

// Increment attempt counter
incrementTaskAttempts(projectPath: string, taskId: string): number
```

### Task Query Operations

```typescript
// Flatten task tree to list
flattenTasks(tasks: Task[]): Task[]

// Get next available task
getNextTask(projectPath: string): Task | null

// Get task statistics
getTaskStats(projectPath: string): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
  blocked: number;
}

// Check if dependencies are met
areDependenciesMet(tasks: Task[], task: Task): boolean

// Check if task is at root level
isRootTask(tasks: Task[], taskId: string): boolean
```

### Task Validation

```typescript
// Validate entire task tree
validateTaskTree(projectPath: string): TaskValidationResult

interface TaskValidationResult {
  valid: boolean;
  errors: string[];     // Critical issues
  warnings: string[];   // Non-critical issues
}

// Detect circular dependencies
detectCircularDependencies(tasks: Task[]): string[]

// Format tasks for display
formatTaskTree(
  tasks: Task[],
  format: "tree" | "flat" | "summary" = "tree"
): string
```

### Signal Operations

```typescript
// Read signal file
readSignal(projectPath: string): Signal | null

// Write signal file
writeSignal(
  projectPath: string,
  action: SignalAction,
  data?: TaskSignalData
): void

// Clear signal file
clearSignal(projectPath: string): void
```

### History Operations

```typescript
// Get all sessions
getHistory(projectPath: string): LoopSession[]

// Add new session
addSession(projectPath: string, session: LoopSession): void

// Update existing session
updateSession(
  projectPath: string,
  sessionId: string,
  updates: Partial<LoopSession>
): boolean

// Get specific session
getSession(projectPath: string, sessionId: string): LoopSession | null

// Generate unique session ID
generateSessionId(): string
```

## Implementation Details

### Recursive Task Search

```typescript
function findTask(tasks: Task[], id: string): Task | null {
  for (const task of tasks) {
    if (task.id === id) {
      return task;
    }
    if (task.tasks) {
      const found = findTask(task.tasks, id);
      if (found) return found;
    }
  }
  return null;
}

function findTaskWithParent(tasks: Task[], id: string): {
  task: Task;
  parent: Task[];
} | null {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) {
      return { task: tasks[i], parent: tasks };
    }
    if (tasks[i].tasks) {
      const found = findTaskWithParent(tasks[i].tasks, id);
      if (found) return found;
    }
  }
  return null;
}
```

### Dependency Validation

```typescript
function areDependenciesMet(tasks: Task[], task: Task): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return true;
  }

  const flat = flattenTasks(tasks);

  for (const depId of task.dependsOn) {
    const dep = flat.find(t => t.id === depId);
    if (!dep || dep.status !== "completed") {
      return false;
    }
  }

  return true;
}
```

### Circular Dependency Detection

Uses Depth-First Search with a recursion stack:

```typescript
function detectCircularDependencies(tasks: Task[]): string[] {
  const flat = flattenTasks(tasks);
  const errors: string[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(taskId: string): boolean {
    visited.add(taskId);
    recStack.add(taskId);
    path.push(taskId);

    const task = flat.find(t => t.id === taskId);
    if (task?.dependsOn) {
      for (const depId of task.dependsOn) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recStack.has(depId)) {
          // Found cycle
          const cycleStart = path.indexOf(depId);
          const cycle = path.slice(cycleStart).concat(depId);
          errors.push(`Circular dependency: ${cycle.join(" -> ")}`);
          return true;
        }
      }
    }

    path.pop();
    recStack.delete(taskId);
    return false;
  }

  for (const task of flat) {
    if (!visited.has(task.id)) {
      dfs(task.id);
    }
  }

  return errors;
}
```

### Task Tree Flattening

```typescript
function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];

  function traverse(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      if (task.tasks) {
        traverse(task.tasks);
      }
    }
  }

  traverse(tasks);
  return result;
}
```

### Next Task Selection

```typescript
function getNextTask(projectPath: string): Task | null {
  const tasks = getTasks(projectPath);
  const config = getConfig(projectPath);
  const maxAttempts = config.loop?.maxAttemptsPerTask ?? 3;
  const flat = flattenTasks(tasks);

  for (const task of flat) {
    if (task.status !== "pending") continue;
    if (!areDependenciesMet(tasks, task)) continue;

    const taskMaxAttempts = task.maxAttempts ?? maxAttempts;
    if ((task.attempts ?? 0) >= taskMaxAttempts) continue;

    return task;
  }

  return null;
}
```

### Task Tree Formatting

```typescript
function formatTaskTree(
  tasks: Task[],
  format: "tree" | "flat" | "summary" = "tree"
): string {
  if (format === "summary") {
    const stats = calculateStats(tasks);
    return `Tasks: ${stats.total} (${stats.pending} pending, ${stats.completed} completed)`;
  }

  if (format === "flat") {
    return flattenTasks(tasks)
      .map(t => `[${t.status}] ${t.id}: ${t.title}`)
      .join("\n");
  }

  // Tree format
  const lines: string[] = [];

  function renderTree(taskList: Task[], indent = "") {
    for (const task of taskList) {
      const icon = getStatusIcon(task.status);
      lines.push(`${indent}${icon} ${task.id}: ${task.title}`);
      if (task.tasks) {
        renderTree(task.tasks, indent + "  ");
      }
    }
  }

  renderTree(tasks);
  return lines.join("\n");
}

function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "completed": return "✓";
    case "in_progress": return "●";
    case "pending": return "○";
    case "skipped": return "✗";
    case "blocked": return "⚠";
  }
}
```

## Error Handling

### File Not Found

```typescript
function getTasks(projectPath: string): Task[] {
  const filePath = join(getProjectDir(projectPath), "tasks.json");
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return []; // Return empty array if file missing or invalid
  }
}
```

### JSON Parse Errors

```typescript
function getConfig(projectPath: string): ProjectConfig {
  const filePath = join(getProjectDir(projectPath), "config.json");
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return {}; // Return empty config on error
  }
}
```

### Validation Errors

Operations that can fail return result objects:

```typescript
interface OperationResult {
  success: boolean;
  error?: string;
}

function insertTask(...): OperationResult {
  // Validate ID uniqueness
  if (findTask(tasks, task.id)) {
    return { success: false, error: `Task ID '${task.id}' already exists` };
  }

  // Validate dependencies
  for (const depId of task.dependsOn ?? []) {
    if (!findTask(tasks, depId)) {
      return { success: false, error: `Dependency '${depId}' not found` };
    }
  }

  // ... perform insert
  return { success: true };
}
```

## History Management

### Session ID Generation

```typescript
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}
```

### History Trimming

```typescript
const MAX_HISTORY_ENTRIES = 100;

function addSession(projectPath: string, session: LoopSession): void {
  const history = getHistory(projectPath);
  history.sessions.unshift(session); // Add at beginning

  // Trim to max entries
  if (history.sessions.length > MAX_HISTORY_ENTRIES) {
    history.sessions = history.sessions.slice(0, MAX_HISTORY_ENTRIES);
  }

  saveHistory(projectPath, history);
}
```

## Constants

```typescript
const DEFAULTS = {
  maxIterations: 10,
  maxAttemptsPerTask: 3,
} as const;

const FILES = {
  projectConfig: "config.json",
  tasks: "tasks.json",
  signal: ".signal",
  history: "history.json",
} as const;
```

## Related Documentation

- [Core Concepts](./core-concepts.md) - Task fundamentals
- [Configuration](./configuration.md) - Config file details
- [MCP Server](./mcp-server.md) - Tool implementations
- [Architecture](./architecture.md) - System design
