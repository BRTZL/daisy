# Getting Started with Daisy

This guide will walk you through installing Daisy, creating your first project, and running your first autonomous development loop.

## Prerequisites

- **Node.js 18+**: Daisy requires Node.js version 18 or higher
- **Claude Code**: You need Claude Code CLI installed and authenticated
- **macOS**: The daemon feature currently only supports macOS (launchd)

## Installation

### Install via npm (Recommended)

```bash
npm install -g daisy
```

### Verify Installation

```bash
daisy --help
```

You should see the available commands listed.

## Your First Project

### Step 1: Initialize a Project

Navigate to your project directory and run:

```bash
cd my-awesome-project
daisy init
```

Or create a new project directory:

```bash
daisy init my-new-project
```

This creates:
- `.daisy/config.json` - Project configuration
- `.daisy/tasks.json` - Empty task list
- `.daisy/PROMPT.md` - Base prompt template
- `.claude/settings.json` - Claude Code permissions
- `.mcp.json` - MCP server configuration

### Step 2: Edit the Base Prompt

Open `.daisy/PROMPT.md` and customize it for your project:

```markdown
# Project Overview

This is a web application for managing inventory.

# Goals

- Build a modern React frontend
- Create a Node.js API backend
- Use PostgreSQL for data storage

# Guidelines

- Follow existing code patterns
- Write tests for new features
- Use TypeScript throughout

# Technical Notes

- Frontend runs on port 3000
- API runs on port 4000
- Database migrations in /migrations
```

### Step 3: Create Tasks

You can create tasks in three ways:

#### Option A: Edit tasks.json directly

```json
[
  {
    "id": "setup-database",
    "title": "Set up PostgreSQL database",
    "description": "Create the database schema and initial migrations",
    "status": "pending",
    "acceptanceCriteria": [
      "Database container running",
      "Initial schema created",
      "Connection tested"
    ]
  },
  {
    "id": "create-api",
    "title": "Create API endpoints",
    "status": "pending",
    "dependsOn": ["setup-database"],
    "tasks": [
      {
        "id": "create-api-users",
        "title": "User CRUD endpoints",
        "status": "pending"
      },
      {
        "id": "create-api-products",
        "title": "Product CRUD endpoints",
        "status": "pending"
      }
    ]
  }
]
```

#### Option B: Use the Web UI Planning Mode

1. Start the daemon: `daisy start`
2. Open the UI: `daisy open`
3. Go to the "Planning" tab
4. Describe your feature and let Claude help break it down into tasks

#### Option C: Use MCP Tools (when Claude is running)

Claude can use the `add_task` tool to create tasks during a planning session.

### Step 4: Install and Start the Daemon

For the best experience, install the Daisy daemon:

```bash
daisy install
```

This:
- Configures `/etc/hosts` to route `daisy.test` to localhost
- Creates a launchd plist for auto-starting on login
- Starts the daemon

### Step 5: Open the Web UI

```bash
daisy open
```

Or navigate to `http://daisy.test:4141` in your browser.

### Step 6: Start Your First Loop

In the web UI:

1. Make sure you have at least one pending task
2. Set the maximum iterations (or leave blank for unlimited)
3. Ensure "Use tasks" is checked for task-based mode
4. Click "Start Loop"

Watch as Claude works through your tasks!

## Understanding the Web UI

### Dashboard View

The default view shows:
- **Left sidebar**: Task tree with expand/collapse, add/edit/delete actions
- **Right panel top**: Loop controls (start/stop, settings)
- **Right panel bottom**: Real-time logs from Claude
- **Stats bar**: Progress, tokens used, cost

### Board View

A Kanban-style board with columns:
- **Pending**: Tasks not yet started
- **In Progress**: Currently being worked on
- **Blocked**: Cannot proceed (dependencies not met)
- **Completed**: Finished tasks
- **Skipped**: Tasks that were skipped

Drag and drop cards to manually change status.

### Planning View

An interactive chat interface where you can:
- Describe features in natural language
- Claude breaks them down into structured tasks
- Review and modify the generated task tree
- Finalize the plan to save tasks

### History View

View all past loop sessions with:
- Start/end times and duration
- Iteration count
- Token usage and cost
- Which tasks were completed

## CLI Commands Quick Reference

| Command | Description |
|---------|-------------|
| `daisy init [path]` | Initialize a new project |
| `daisy install` | Install daemon and configure hosts |
| `daisy start` | Start the daemon |
| `daisy stop` | Stop the daemon |
| `daisy open` | Open web UI in browser |
| `daisy use <path>` | Switch to a different project |
| `daisy uninstall` | Remove daemon and hosts entry |
| `daisy mcp` | Start MCP server (used by Claude) |

See [CLI Commands](./cli-commands.md) for detailed documentation.

## Project Configuration

Edit `.daisy/config.json` to customize:

```json
{
  "loop": {
    "maxIterations": 10,
    "maxAttemptsPerTask": 3
  },
  "webhooks": [
    {
      "name": "Slack Notifications",
      "url": "https://hooks.slack.com/...",
      "events": ["task_completed", "loop_completed", "error"],
      "active": true,
      "secret": "optional-hmac-secret"
    }
  ]
}
```

See [Configuration](./configuration.md) for all options.

## Task Structure

Tasks support a rich set of properties:

```json
{
  "id": "unique-task-id",
  "title": "Human readable title",
  "description": "Detailed description of what needs to be done",
  "status": "pending",
  "dependsOn": ["other-task-id"],
  "acceptanceCriteria": [
    "Criterion 1",
    "Criterion 2"
  ],
  "maxAttempts": 3,
  "tasks": [
    { "id": "subtask-1", "title": "Subtask", "status": "pending" }
  ]
}
```

See [Core Concepts](./core-concepts.md) for detailed task documentation.

## Tips for Success

### 1. Write Clear Task Descriptions

Claude works best with clear, actionable tasks:

```json
// Good
{
  "title": "Add user authentication with JWT",
  "description": "Implement login/logout endpoints using JWT tokens. Store refresh tokens in Redis.",
  "acceptanceCriteria": [
    "POST /auth/login returns JWT token",
    "POST /auth/logout invalidates token",
    "Protected routes require valid token"
  ]
}

// Less clear
{
  "title": "Auth stuff",
  "description": "Make auth work"
}
```

### 2. Use Dependencies Wisely

Order your tasks with dependencies:

```json
[
  { "id": "setup-db", "title": "Set up database", "status": "pending" },
  { "id": "create-models", "title": "Create data models", "status": "pending", "dependsOn": ["setup-db"] },
  { "id": "create-api", "title": "Create API", "status": "pending", "dependsOn": ["create-models"] }
]
```

### 3. Keep Tasks Focused

One task = one logical unit of work. If a task is too big, break it into subtasks.

### 4. Review the Logs

Watch the log viewer to understand what Claude is doing. You can filter and search logs for debugging.

### 5. Use the Planning Mode

Don't write tasks from scratch. Describe your feature in planning mode and let Claude help structure it.

## Troubleshooting

### Daemon Won't Start

1. Check if already running: `launchctl list | grep daisy`
2. Check logs: `cat ~/Library/Logs/daisy/stderr.log`
3. Reinstall: `daisy uninstall && daisy install`

### Claude Not Finding MCP Server

1. Verify `.mcp.json` exists in project root
2. Check that `daisy mcp` command works: `daisy mcp`
3. Ensure Claude Code is using the right config

### Tasks Not Progressing

1. Check the signal file: `cat .daisy/.signal`
2. Verify task dependencies are met
3. Check if task exceeded max attempts

### Web UI Not Loading

1. Verify daemon is running: `daisy start`
2. Check the port: `curl http://localhost:4141/api/projects`
3. Try direct IP: `http://127.0.0.1:4141`

## Next Steps

- Read [Core Concepts](./core-concepts.md) to understand how Daisy works
- Explore [Architecture](./architecture.md) for technical details
- Check [Webhooks](./webhooks.md) for external integrations
- See [Configuration](./configuration.md) for all options
