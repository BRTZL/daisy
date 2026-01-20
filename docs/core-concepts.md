# Core Concepts

This document explains the fundamental concepts you need to understand to use Daisy effectively.

## The Daisy Loop

The core of Daisy is the **autonomous development loop**. This is a cycle where:

1. Claude Code receives a task with full context
2. Works on the task using available tools
3. Updates task status when done
4. Signals that the iteration is complete
5. Daisy starts the next iteration with a fresh context

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ┌─────────────┐                                         │
│    │   START     │                                         │
│    └──────┬──────┘                                         │
│           │                                                 │
│           ▼                                                 │
│    ┌─────────────────────────────────────────┐             │
│    │  Generate Dynamic Prompt                 │             │
│    │  • Current task (title, description)    │             │
│    │  • Completed tasks (DO NOT REDO)        │             │
│    │  • Pending tasks (DO NOT WORK YET)      │             │
│    │  • Base prompt (PROMPT.md)              │             │
│    └──────────────────┬──────────────────────┘             │
│                       │                                     │
│                       ▼                                     │
│    ┌─────────────────────────────────────────┐             │
│    │  Spawn Claude Code                       │             │
│    │  • Pass prompt via stdin                │             │
│    │  • --output-format stream-json          │             │
│    │  • --mcp-config (Daisy MCP server)      │             │
│    └──────────────────┬──────────────────────┘             │
│                       │                                     │
│                       ▼                                     │
│    ┌─────────────────────────────────────────┐             │
│    │  Claude Works on Task                    │             │
│    │  • Uses MCP tools                       │             │
│    │  • Updates task status                  │             │
│    │  • Writes signal file                   │             │
│    └──────────────────┬──────────────────────┘             │
│                       │                                     │
│                       ▼                                     │
│    ┌─────────────────────────────────────────┐             │
│    │  Process Iteration Results               │             │
│    │  • Parse token usage                    │             │
│    │  • Accumulate costs                     │             │
│    │  • Check if all tasks complete          │             │
│    └──────────────────┬──────────────────────┘             │
│                       │                                     │
│           ┌───────────┴───────────┐                        │
│           │                       │                        │
│     All Complete?           More Tasks?                    │
│           │                       │                        │
│           ▼                       ▼                        │
│    ┌─────────────┐         ┌─────────────┐                 │
│    │    END      │         │  2s Pause   │────────────┐    │
│    └─────────────┘         └─────────────┘            │    │
│                                                       │    │
│                      ◄────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Loop Modes

Daisy supports two execution modes:

### Task-Based Mode

In task-based mode, Claude works through a defined task list one task at a time:

- **One task per iteration**: Claude is explicitly told to focus on only the current task
- **Dependency ordering**: Tasks with `dependsOn` are only worked on after dependencies complete
- **Automatic progression**: When a task is marked complete, the next pending task is assigned
- **Completion detection**: Loop ends when all tasks are completed

**Best for**: Structured projects with clear, defined work items.

### Open-Ended Mode

In open-ended mode, Claude works without a predefined task list:

- **Activity log**: Progress is tracked in `.daisy/activity.md`
- **Free-form work**: Claude decides what to work on
- **Manual completion**: Claude signals when all work is done via `completeLoop: true`
- **Context via activity log**: Previous work is included in the prompt

**Best for**: Exploratory work, refactoring, or when tasks aren't clearly defined upfront.

## Tasks

Tasks are the atomic units of work in Daisy. They form a hierarchical tree structure.

### Task Properties

```typescript
interface Task {
  // Required
  id: string;                    // Unique identifier (e.g., "auth-1", "setup")
  title: string;                 // Human-readable title
  status: TaskStatus;            // Current state

  // Optional
  description?: string;          // Detailed description
  dependsOn?: string[];          // IDs of tasks that must complete first
  acceptanceCriteria?: string[]; // Criteria for completion
  tasks?: Task[];                // Nested subtasks (recursive)

  // Attempt tracking
  attempts?: number;             // Current attempt count
  maxAttempts?: number;          // Max attempts before auto-skip

  // Status metadata
  skipReason?: string;           // Why task was skipped
  completionSummary?: string;    // What was accomplished

  // Timestamps
  createdAt?: string;            // When created
  updatedAt?: string;            // Last modification
  completedAt?: string;          // When completed
}
```

### Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Not yet started |
| `in_progress` | Currently being worked on |
| `completed` | Successfully finished |
| `skipped` | Intentionally skipped (with reason) |
| `blocked` | Cannot proceed (dependencies not met) |

### Task Dependencies

Tasks can depend on other tasks:

```json
[
  {
    "id": "setup-db",
    "title": "Set up database",
    "status": "pending"
  },
  {
    "id": "create-models",
    "title": "Create data models",
    "status": "pending",
    "dependsOn": ["setup-db"]
  }
]
```

Rules:
- A task with dependencies can only start when ALL dependencies are `completed`
- Circular dependencies are detected and prevented
- Self-dependencies are not allowed

### Nested Tasks (Subtasks)

Tasks can contain child tasks:

```json
{
  "id": "auth",
  "title": "Authentication System",
  "status": "pending",
  "tasks": [
    {
      "id": "auth-login",
      "title": "Login endpoint",
      "status": "pending"
    },
    {
      "id": "auth-logout",
      "title": "Logout endpoint",
      "status": "pending",
      "dependsOn": ["auth-login"]
    }
  ]
}
```

Subtasks:
- Have their own status independent of parent
- Can have dependencies on siblings or other tasks
- Parent status is not automatically updated when children complete

### Task ID Conventions

Task IDs should be:
- Lowercase with hyphens: `setup-database`, `auth-login`
- Unique across the entire task tree
- Descriptive but concise

Valid patterns: `^[a-zA-Z0-9_-]+$`

### Acceptance Criteria

Define what "done" means for a task:

```json
{
  "id": "setup-auth",
  "title": "Set up authentication",
  "acceptanceCriteria": [
    "Login endpoint returns JWT token",
    "Logout endpoint invalidates token",
    "Protected routes require valid token",
    "Tests pass for all auth flows"
  ]
}
```

Claude uses these to verify completion before marking a task done.

## Iterations

An **iteration** is a single execution cycle of Claude Code within a loop.

### Iteration Lifecycle

1. **Start**: Dynamic prompt generated with task context
2. **Execute**: Claude runs with MCP tools available
3. **Signal**: Claude signals completion via MCP tool
4. **End**: Daisy processes results and token usage

### Iteration Limits

- **maxIterations**: Maximum number of iterations before loop stops
- **maxAttemptsPerTask**: Maximum attempts on a single task before auto-skip

If a task exceeds `maxAttemptsPerTask`:
1. Task is automatically marked as `skipped`
2. `skipReason` is set to explain why
3. Loop continues with next task

### Iteration Output

Each iteration tracks:

```typescript
interface TokenUsage {
  inputTokens: number;      // Tokens in prompt
  outputTokens: number;     // Tokens generated
  cacheCreateTokens: number; // Tokens for cache creation
  cacheReadTokens: number;   // Tokens read from cache
  costUsd: number;          // Total cost in USD
}
```

## Signals

Signals are the Inter-Process Communication (IPC) mechanism between Claude (via MCP) and the Loop Runner.

### Signal File

Location: `.daisy/.signal`

Format:
```json
{
  "action": "iteration_complete",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "taskId": "setup-db",
    "status": "completed",
    "taskTitle": "Set up database"
  }
}
```

### Signal Actions

| Action | Meaning | When Used |
|--------|---------|-----------|
| `task_updated` | Task status changed | After `update_task_status` |
| `iteration_complete` | Current iteration done | After task work complete |
| `all_complete` | All tasks finished | When no pending tasks remain |
| `loop_complete` | End loop now | In open-ended mode |

### Signal Flow

```
Claude calls update_task_status("task-1", "completed")
                    │
                    ▼
        MCP Server receives call
                    │
                    ▼
        Updates task in tasks.json
                    │
                    ▼
        Writes signal: { action: "task_updated", ... }
                    │
                    ▼
        Loop Runner watches .signal file via fs.watch()
                    │
                    ▼
        Reads signal, processes action
                    │
                    ▼
        If all tasks complete: set allComplete = true
        Else: continue iteration
```

## Prompts

### Base Prompt (PROMPT.md)

The base prompt provides context about your project:

```markdown
# Project Overview

Brief description of what the project does.

# Goals

What Claude should accomplish during this session.

# Guidelines

- Coding standards
- Testing requirements
- Documentation expectations

# Technical Notes

- Architecture details
- Key files and their purposes
- Dependencies and constraints
```

This is appended to every iteration's dynamic prompt.

### Dynamic Prompt

Generated per-iteration, contains:

1. **Iteration number**: `## Iteration 5 of 10`
2. **Critical rules**: "ONE TASK PER ITERATION" warning
3. **Completed tasks**: List of what's done (marked DO NOT REDO)
4. **Current task**: Full details of the task to work on
5. **Pending tasks**: What's coming (marked DO NOT WORK ON YET)
6. **Instructions**: How to use MCP tools
7. **Base prompt**: Appended at end

Example structure:
```markdown
## Iteration 3 of 10

### CRITICAL: One Task Per Iteration
Complete ONLY the current task...

### Completed Tasks (DO NOT REDO)
- ✓ setup-db: Set up database
- ✓ create-models: Create data models

### Current Task
**ID**: auth-login
**Title**: Login endpoint
**Description**: Create POST /auth/login that validates credentials...
**Acceptance Criteria**:
- Returns JWT on valid credentials
- Returns 401 on invalid credentials

### Instructions
Use these MCP tools:
- update_task_status(taskId, status)
- signal_iteration_complete()

### Pending Tasks (DO NOT WORK ON YET)
- ○ auth-logout: Logout endpoint
- ○ auth-refresh: Token refresh

---

[Base PROMPT.md content here]
```

## Sessions

A **session** is a complete loop run from start to finish.

### Session Properties

```typescript
interface LoopSession {
  id: string;                    // Unique ID
  startedAt: string;            // ISO timestamp
  completedAt: string | null;   // ISO timestamp or null
  iterations: number;           // Total iterations run
  mode: "task-based" | "open-ended";
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  tasksCompleted: string[];     // Task IDs completed
  status: SessionStatus;
}

type SessionStatus = "running" | "completed" | "stopped" | "error";
```

### Session History

Sessions are stored in `.daisy/history.json`:
- Maximum 100 sessions retained
- Newest first
- Older sessions automatically trimmed

## MCP Tools

Claude interacts with Daisy via MCP (Model Context Protocol) tools:

### Execution Tools

| Tool | Purpose |
|------|---------|
| `get_next_task` | Get the next pending task |
| `update_task_status` | Change a task's status |
| `signal_iteration_complete` | Signal iteration done |
| `get_stats` | Get task statistics |

### Planning Tools

| Tool | Purpose |
|------|---------|
| `add_task` | Create a new task |
| `update_plan_task` | Modify task properties |
| `remove_task` | Delete a task (and subtasks) |
| `list_plan_tasks` | List tasks in various formats |
| `finalize_plan` | Validate and finalize task tree |

See [MCP Server](./mcp-server.md) for complete tool documentation.

## Cost Tracking

Daisy tracks token usage and costs:

### Per-Iteration

- Input tokens (prompt)
- Output tokens (response)
- Cache tokens (creation and read)
- Cost in USD

### Per-Session

- Accumulated totals
- Stored in session history

### Display

The web UI shows:
- Real-time token counters
- Running cost total
- Session history with costs

## Webhooks

Daisy can notify external systems of events:

### Webhook Events

| Event | When |
|-------|------|
| `loop_started` | Loop begins |
| `loop_completed` | Loop ends |
| `iteration_started` | Iteration begins |
| `iteration_completed` | Iteration ends |
| `task_started` | Task work begins |
| `task_completed` | Task marked complete |
| `task_failed` | Task failed/skipped |
| `error` | Error occurred |

### Webhook Security

Webhooks support HMAC-SHA256 signing:
- Secret stored in config
- Signature in `X-Daisy-Signature` header
- Verify to ensure authentic notifications

See [Webhooks](./webhooks.md) for configuration details.

## Project Context

### Project Detection

Daisy finds projects by:
1. Checking `DAISY_PROJECT_PATH` environment variable
2. Traversing up from current directory looking for `.daisy/config.json`

### Current Project

The "current" project is:
- Set via `daisy use <path>`
- Stored in global config
- Used by daemon for context

### Known Projects

All initialized projects are tracked in `~/.daisy/projects.json`:
```json
{
  "projects": [
    "/Users/you/project-a",
    "/Users/you/project-b"
  ],
  "current": "/Users/you/project-a"
}
```

## Related Documentation

- [Architecture](./architecture.md) - System design
- [Loop Runner](./loop-runner.md) - Execution details
- [Storage](./storage.md) - File format specifications
- [MCP Server](./mcp-server.md) - Tool specifications
