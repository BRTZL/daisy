# Daisy Documentation

**Daisy** is a TypeScript CLI tool and MCP server for **continuous autonomous AI development**. It implements the "Ralph Wiggum" technique (named by Geoffrey Huntley) - managing infinite loops where Claude Code works on tasks, and when it tries to exit, a hook intercepts and feeds the same task back for continuous iteration.

## Version Information

- **Current Version**: 2.1.0
- **License**: MIT
- **Node.js Requirement**: >=18.0.0

## What Does Daisy Do?

Daisy enables you to:

1. **Define Tasks**: Create a hierarchical task tree with dependencies, acceptance criteria, and nested subtasks
2. **Run Autonomous Loops**: Start Claude Code in continuous mode where it works through tasks one at a time
3. **Monitor Progress**: Real-time web UI showing task status, logs, token usage, and costs
4. **Plan Interactively**: Use AI-assisted planning to break down features into actionable tasks
5. **Track History**: View past sessions with detailed analytics

## Documentation Index

### Getting Started
- [Getting Started Guide](./getting-started.md) - Installation, first project setup, running your first loop

### Core Concepts
- [Core Concepts](./core-concepts.md) - Understanding Daisy's fundamental concepts: tasks, loops, iterations, signals
- [Architecture Overview](./architecture.md) - System design, component relationships, data flow

### Component Documentation
- [CLI Commands](./cli-commands.md) - Complete reference for all CLI commands
- [Loop Runner](./loop-runner.md) - How the autonomous loop execution works
- [MCP Server](./mcp-server.md) - Model Context Protocol integration for Claude Code
- [Storage Layer](./storage.md) - File-based persistence system
- [Web UI](./web-ui.md) - Dashboard, Kanban board, and planning interface
- [Daemon](./daemon.md) - macOS launchd daemon management

### Advanced Topics
- [Webhooks](./webhooks.md) - External notification integration
- [Configuration](./configuration.md) - All configuration options and settings

## Quick Start

```bash
# Install globally
npm install -g daisy

# Initialize a new project
daisy init my-project

# Install the daemon (macOS)
daisy install

# Open the web UI
daisy open
```

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI (React)                          │
│   Dashboard │ Kanban Board │ Planning Chat │ Session History    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket + REST
┌───────────────────────────────▼─────────────────────────────────┐
│                      HTTP Server (Hono)                          │
│   REST API │ Static Files │ WebSocket Server                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     Loop Service                                 │
│   Orchestrates Claude Code execution │ Manages loop state        │
└────────────────┬──────────────────────────────┬─────────────────┘
                 │                              │
┌────────────────▼────────────┐   ┌─────────────▼─────────────────┐
│     Claude Code Subprocess  │   │      MCP Server               │
│   stream-json output format │   │   Tools for task management   │
└────────────────┬────────────┘   └─────────────┬─────────────────┘
                 │                              │
                 │     Signal File (.signal)    │
                 └──────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     Storage Layer (JSON Files)                   │
│   tasks.json │ config.json │ history.json │ PROMPT.md            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files in a Daisy Project

After running `daisy init`, your project will have:

```
your-project/
├── .daisy/                    # Daisy project directory
│   ├── config.json           # Loop settings, webhook configs
│   ├── tasks.json            # Task definitions (recursive tree)
│   ├── PROMPT.md             # Base prompt template for Claude
│   ├── history.json          # Session history
│   ├── plans/                # Planning session data
│   └── .signal               # IPC signal file (runtime)
├── .claude/
│   └── settings.json         # Claude Code permissions
└── .mcp.json                 # MCP server configuration
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| CLI | Commander.js, chalk, ora, inquirer |
| Core Runtime | TypeScript, Node.js |
| MCP Server | @modelcontextprotocol/sdk |
| Web UI | React 19, Vite, Tailwind CSS |
| HTTP Server | Hono |
| Real-time | WebSocket (ws) |
| Validation | Zod |
| Build | tsup, Vite |
| Testing | Vitest |
| Formatting | Biome |

## How the Loop Works

1. **Iteration Start**: Daisy generates a dynamic prompt containing:
   - The current task (with title, description, acceptance criteria)
   - Completed tasks (marked as DO NOT REDO)
   - Pending tasks (marked as DO NOT WORK ON YET)
   - Base prompt instructions

2. **Claude Execution**: Claude Code runs with:
   - The generated prompt
   - MCP server providing task management tools
   - Stream-json output format for parsing

3. **Task Progress**: Claude uses MCP tools to:
   - Update task status (pending → in_progress → completed)
   - Signal when iteration is complete

4. **Loop Continuation**: When Claude signals completion:
   - Daisy parses the signal file
   - Accumulates token usage and costs
   - Either starts next iteration or ends loop

5. **Loop End**: The loop ends when:
   - All tasks are completed
   - Maximum iterations reached
   - User manually stops it

## Contributing

See the [Architecture](./architecture.md) document for understanding the codebase structure before contributing.

## Related Documentation

- [CLAUDE.md](../.claude/CLAUDE.md) - Internal development guidelines
- [JSON Schemas](../schemas/) - Validation schemas for config and tasks
