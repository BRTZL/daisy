# MCP Server

The MCP (Model Context Protocol) server provides Claude Code with tools to interact with Daisy's task management system. It enables Claude to query tasks, update statuses, and signal loop completion.

## Overview

The MCP server:
- Runs as a subprocess started by Claude Code
- Communicates via stdio (stdin/stdout)
- Provides 12 tools for task management
- Writes signal files for IPC with Loop Runner
- Uses JSON responses in all tools

## Server Configuration

### Entry Point

The server is started via `daisy mcp` command, which is configured in `.mcp.json`:

```json
{
  "mcpServers": {
    "daisy": {
      "command": "daisy",
      "args": ["mcp"]
    }
  }
}
```

### Server Metadata

```typescript
{
  name: "daisy-mcp-server",
  version: "2.0.0"
}
```

## Tools Reference

### Execution Tools

These tools are used during loop execution when Claude is working on tasks.

---

#### `get_current_project`

Get information about the current Daisy project.

**Arguments**: None

**Returns**:
```json
{
  "name": "my-project",
  "path": "/path/to/project",
  "config": {
    "loop": {
      "maxIterations": 10,
      "maxAttemptsPerTask": 3
    }
  },
  "stats": {
    "tasks": {
      "total": 10,
      "pending": 5,
      "inProgress": 1,
      "completed": 3,
      "skipped": 1,
      "blocked": 0
    }
  }
}
```

**Error**: Returns error if not in a Daisy project.

---

#### `list_tasks`

List tasks with optional filtering.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `taskId` | string | No | Filter to specific task and its subtree |
| `status` | TaskStatus | No | Filter by status |
| `flat` | boolean | No | Flatten hierarchy to list |

**TaskStatus values**: `pending`, `in_progress`, `completed`, `skipped`, `blocked`

**Returns**:
```json
{
  "tasks": [
    {
      "id": "setup",
      "title": "Project Setup",
      "status": "completed",
      "tasks": [...]
    }
  ],
  "count": 5
}
```

**Behavior**:
- If `taskId` provided: Returns that task and its subtree
- If `flat: true`: Returns flattened list instead of tree
- If `status` provided: Recursively filters, preserving parent structure

---

#### `get_next_task`

Get the next pending task that can be worked on.

**Arguments**: None

**Returns**:
```json
{
  "task": {
    "id": "auth-login",
    "title": "Implement login endpoint",
    "description": "Create POST /auth/login...",
    "status": "pending",
    "acceptanceCriteria": [
      "Returns JWT on success",
      "Returns 401 on failure"
    ],
    "dependsOn": ["setup-db"]
  }
}
```

Or if no tasks available:
```json
{
  "task": null,
  "message": "No pending tasks with met dependencies"
}
```

**Selection Logic**:
1. Status must be `pending`
2. All dependencies must be `completed`
3. Task hasn't exceeded `maxAttempts`

---

#### `update_task_status`

Update a task's status.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to update |
| `status` | TaskStatus | Yes | New status |
| `skipReason` | string | No | Reason for skipping (if status=skipped) |
| `completionSummary` | string | No | Summary of work (if status=completed) |

**Returns**:
```json
{
  "success": true,
  "message": "Task 'auth-login' status updated to completed",
  "action": "iteration_complete"
}
```

**Side Effects**:
1. Updates task status in `tasks.json`
2. Sets `updatedAt` timestamp
3. Sets `completedAt` if status is `completed`
4. Writes signal file:
   - If all tasks complete: `all_complete`
   - Otherwise: `iteration_complete`

---

#### `get_stats`

Get task statistics.

**Arguments**: None

**Returns**:
```json
{
  "total": 10,
  "pending": 5,
  "inProgress": 1,
  "completed": 3,
  "skipped": 1,
  "blocked": 0
}
```

---

#### `signal_iteration_complete`

Signal that the current iteration is complete.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `reason` | string | No | Reason for completion |
| `completeLoop` | boolean | No | Set true to end entire loop |

**Returns**:
```json
{
  "success": true,
  "message": "Signaled iteration complete",
  "action": "iteration_complete"
}
```

**Behavior**:
- If `completeLoop: true`: Writes `loop_complete` signal
- If all tasks complete: Writes `all_complete` signal
- Otherwise: Writes `iteration_complete` signal

---

#### `start_iteration`

Placeholder for starting iterations (not functional via MCP).

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `maxIterations` | number | No | Maximum iterations |

**Returns**:
```json
{
  "message": "To start iterations, use the CLI command 'daisy run' or the web UI."
}
```

**Note**: This tool exists for documentation but actual iteration starting is done via CLI or web UI.

---

### Planning Tools

These tools are used during interactive planning sessions to build task trees.

---

#### `add_task`

Create a new task.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique task ID |
| `title` | string | Yes | Task title |
| `description` | string | No | Detailed description |
| `parentId` | string | No | Parent task ID for subtasks |
| `dependsOn` | string[] | No | Task IDs this depends on |
| `acceptanceCriteria` | string[] | No | Completion criteria |
| `afterId` | string | No | Insert after this task |
| `beforeId` | string | No | Insert before this task |

**Returns**:
```json
{
  "success": true,
  "message": "Added task 'auth-login' under parent 'auth'",
  "task": {
    "id": "auth-login",
    "title": "Login endpoint",
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Validation**:
- ID must be unique across entire tree
- All `dependsOn` IDs must exist
- `parentId` must exist if provided
- `afterId`/`beforeId` must exist at same level

**Side Effects**: Writes `task_updated` signal

---

#### `update_plan_task`

Update an existing task's properties.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to update |
| `title` | string | No | New title |
| `description` | string | No | New description |
| `dependsOn` | string[] | No | New dependencies |
| `acceptanceCriteria` | string[] | No | New criteria |

**Returns**:
```json
{
  "success": true,
  "message": "Updated task 'auth-login': title, description",
  "task": {
    "id": "auth-login",
    "title": "Updated Title",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Validation**:
- Task must exist
- All `dependsOn` IDs must exist
- Cannot depend on self

**Side Effects**: Writes `task_updated` signal

---

#### `remove_task`

Delete a task and all its subtasks.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `taskId` | string | Yes | Task ID to remove |
| `reason` | string | No | Reason for removal |

**Returns**:
```json
{
  "success": true,
  "message": "Removed task 'auth' and 3 subtasks",
  "removedCount": 4
}
```

**Behavior**: Cascades to remove all nested subtasks.

**Side Effects**: Writes `task_updated` signal

---

#### `list_plan_tasks`

List tasks in various formats.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `format` | string | No | `tree`, `flat`, or `summary` |

**Returns (tree format)**:
```json
{
  "formatted": "- ✓ setup: Project Setup\n  - ✓ setup-db: Database\n- ○ auth: Authentication",
  "count": 5,
  "tasks": [...]
}
```

**Returns (summary format)**:
```json
{
  "formatted": "Tasks: 10 (5 pending, 3 completed, 1 in progress, 1 skipped)",
  "count": 10,
  "tasks": [...]
}
```

**Format options**:
- `tree`: ASCII tree with status icons
- `flat`: Simple list format
- `summary`: Count summary only

**Status icons**:
- ✓ completed
- ● in_progress
- ○ pending
- ✗ skipped
- ⚠ blocked

---

#### `finalize_plan`

Validate and finalize the task tree.

**Arguments**:

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `summary` | string | Yes | Planning session summary |

**Returns**:
```json
{
  "success": true,
  "message": "Planning session finalized",
  "taskCount": 15,
  "warnings": [
    "Task 'deployment' has no dependencies - verify ordering is correct"
  ]
}
```

**Validation performed**:
1. Duplicate ID detection
2. Dependency existence verification
3. Self-dependency detection
4. Circular dependency detection (DFS algorithm)
5. Orphan task warnings

**Error returns**:
```json
{
  "error": "Task tree validation failed",
  "errors": [
    "Circular dependency detected: setup -> auth -> setup",
    "Duplicate task ID: config"
  ],
  "warnings": [
    "Task 'deployment' has no dependencies"
  ]
}
```

**Side Effects**: Writes `all_complete` signal on success

---

## Signal File Protocol

The MCP server communicates with the Loop Runner via signal files.

### Signal File Location

`.daisy/.signal`

### Signal Format

```json
{
  "action": "iteration_complete",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "taskId": "auth-login",
    "status": "completed",
    "taskTitle": "Login endpoint"
  }
}
```

### Signal Actions

| Action | When Written | Effect |
|--------|--------------|--------|
| `task_updated` | After any task modification | UI refresh |
| `iteration_complete` | After `signal_iteration_complete()` or task completion | End iteration |
| `all_complete` | When all tasks complete | End loop |
| `loop_complete` | When `completeLoop: true` | End loop |

### Signal Flow

```
Claude calls MCP tool
        │
        ▼
MCP Server processes request
        │
        ▼
Updates tasks.json (if needed)
        │
        ▼
Writes signal file
        │
        ▼
Loop Runner detects via fs.watch()
        │
        ▼
Reads and processes signal
```

## Response Format

All tools return responses in this format:

```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify(response, null, 2)
    }
  ]
}
```

### Success Response

```json
{
  "success": true,
  "message": "Operation completed",
  "data": { /* varies by tool */ }
}
```

### Error Response

```json
{
  "error": "Error message describing what went wrong"
}
```

## Project Detection

The MCP server detects the current project:

1. Check `DAISY_PROJECT_PATH` environment variable
2. Traverse up from current directory looking for `.daisy/config.json`

```typescript
function findProjectRoot(startPath?: string): string | null {
  // Check environment variable
  if (process.env.DAISY_PROJECT_PATH) {
    return process.env.DAISY_PROJECT_PATH;
  }

  // Traverse up directory tree
  let currentPath = startPath || process.cwd();
  while (currentPath !== "/") {
    if (existsSync(join(currentPath, ".daisy", "config.json"))) {
      return currentPath;
    }
    currentPath = dirname(currentPath);
  }
  return null;
}
```

## Error Handling

### Tool-Level Errors

Each tool validates its inputs and returns errors:

```json
{
  "error": "Task 'nonexistent' not found"
}
```

### Global Error Handler

All tool calls are wrapped in try-catch:

```typescript
try {
  // Tool handler
} catch (error) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: error.message })
    }]
  };
}
```

### Common Errors

| Error | Cause |
|-------|-------|
| "Not a daisy project" | No `.daisy/config.json` found |
| "Task '{id}' not found" | Task ID doesn't exist |
| "Task ID '{id}' already exists" | Duplicate ID in add_task |
| "Dependency '{id}' not found" | Invalid dependency reference |
| "Cannot depend on self" | Self-dependency in update |
| "Circular dependency detected" | Circular deps in finalize |

## Storage Interaction

The MCP server interacts with these storage functions:

```typescript
import {
  findTask,
  flattenTasks,
  formatTaskTree,
  getConfig,
  getCurrentProject,
  getNextTask,
  getTaskStats,
  getTasks,
  insertTask,
  removeTaskCascade,
  updateTask,
  updateTaskStatus,
  validateTaskTree,
  writeSignal
} from "../storage/project.js";
```

## Tool Usage Examples

### Example: Working on a Task

```
Claude receives prompt with current task "auth-login"
        │
        ▼
Claude implements the login endpoint
        │
        ▼
Claude calls: update_task_status("auth-login", "completed", "Implemented JWT auth")
        │
        ▼
MCP Server:
  1. Updates task status in tasks.json
  2. Checks if all tasks complete
  3. Writes signal file
  4. Returns success
        │
        ▼
Loop Runner:
  1. Detects signal file change
  2. Reads "iteration_complete" or "all_complete"
  3. Kills Claude process
  4. Starts next iteration or ends loop
```

### Example: Planning Session

```
User: "Create tasks for authentication feature"
        │
        ▼
Claude calls: add_task("auth", "Authentication System", "Implement user auth")
        │
        ▼
Claude calls: add_task("auth-login", "Login Endpoint", parentId="auth")
        │
        ▼
Claude calls: add_task("auth-logout", "Logout Endpoint", parentId="auth", dependsOn=["auth-login"])
        │
        ▼
Claude calls: list_plan_tasks("tree") to review
        │
        ▼
Claude calls: finalize_plan("Created auth task tree with login/logout endpoints")
```

## Related Documentation

- [Core Concepts](./core-concepts.md) - Task and signal fundamentals
- [Loop Runner](./loop-runner.md) - How signals are processed
- [Storage](./storage.md) - File format specifications
- [Architecture](./architecture.md) - System design
