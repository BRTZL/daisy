# Ralph Looper

> Ralph Loop manager for continuous AI development with Claude Code

A comprehensive TypeScript-based CLI tool and MCP server for managing Ralph Loops with Claude Code. The tool combines project management, task tracking, Ralph loop execution, and MCP integration in one powerful package.

## What is Ralph Loop?

[Ralph Wiggum](https://devinterrupted.substack.com/p/inventing-the-ralph-wiggum-loop-creator) is a technique created by Geoffrey Huntley that uses infinite loops to enable continuous autonomous AI development. The concept is simple yet powerful:

```bash
while :; do cat PROMPT.md | claude-code ; done
```

Claude Code works on a task, and when it tries to exit, a hook intercepts the exit and feeds the same task back, creating continuous iteration. Ralph Looper makes this process manageable, trackable, and powerful.

## Features

- 🎯 **Project Management** - Manage multiple projects with ease
- ✅ **Task Tracking** - Import, track, and filter tasks with SQLite persistence
- 🔄 **Ralph Loop Runner** - Execute continuous AI development loops
- 📊 **Progress Monitoring** - Real-time status updates and iteration tracking
- 🔌 **MCP Server** - Native Model Context Protocol integration for Claude Code
- 💻 **Rich CLI** - Interactive commands with filtering, progress bars, and colorful output
- 💾 **Data Persistence** - SQLite + Drizzle ORM for reliable data storage

## Installation

### Global Installation

```bash
bun install -g ralph-looper
# or
npm install -g ralph-looper
```

### Using npx (No Installation)

```bash
npx ralph-looper init
```

## Quick Start

### 1. Initialize a Project

```bash
ralph-looper init ./my-project
```

This creates:
- `.ralph-looper/` directory with database and config
- `PROMPT.md` template
- Imports existing `tasks.json` if present

### 2. View Tasks

```bash
ralph-looper tasks
```

Filter tasks by status:
```bash
ralph-looper tasks --status pending
ralph-looper tasks --filter "auth"
```

### 3. Check Status

```bash
ralph-looper status
```

### 4. Start Ralph Loop

```bash
ralph-looper run 10
```

## CLI Commands

### Project Management

```bash
# Initialize new project
ralph-looper init [path]

# List all projects
ralph-looper project list

# Add existing project
ralph-looper project add [path]

# Switch active project
ralph-looper project switch [id]

# Show current project
ralph-looper project current

# Remove project
ralph-looper project remove [id]
```

### Task Management

```bash
# List all tasks
ralph-looper tasks

# Filter by status
ralph-looper tasks --status pending

# Search tasks
ralph-looper tasks --filter "auth"

# Interactive selection
ralph-looper tasks --interactive
```

### Loop Management

```bash
# Start Ralph loop (10 iterations)
ralph-looper run 10

# Start with custom max iterations
ralph-looper run --max 20

# Continue from last iteration
ralph-looper run --continue

# Watch status.json for updates
ralph-looper run --watch
```

### Status & Configuration

```bash
# Show current status
ralph-looper status

# Output as JSON
ralph-looper status --json

# Manage configuration
ralph-looper config
```

### MCP Server

```bash
# Start MCP server (stdio for Claude Desktop)
ralph-looper mcp --stdio

# Start with HTTP transport
ralph-looper mcp --port 3000
```

## MCP Server Integration

### Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ralph-looper": {
      "command": "node",
      "args": ["/path/to/node_modules/.bin/ralph-looper-mcp"],
      "env": {
        "RALPH_LOOPER_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

### Available MCP Tools

1. **get_current_project** - Get active project and status
2. **list_tasks** - List/filter tasks by status or section
3. **get_task_status** - Get current progress from status.json
4. **update_task_status** - Update specific task item status
5. **update_section_status** - Update entire section status
6. **update_progress** - Update progress (phase, message, completion)
7. **start_iteration** - Start new Ralph loop iteration
8. **get_iteration_stats** - Get iteration and usage statistics

## Project Structure

```
ralph-looper/
├── .ralph-looper/              # Project-local config
│   ├── database.sqlite         # SQLite database
│   ├── PROMPT.md               # Prompt template
│   ├── tasks.json              # Task definitions
│   ├── status.json             # Current status
│   └── config.json             # Project config
│
├── src/
│   ├── cli/                    # CLI commands
│   ├── mcp/                    # MCP server
│   ├── db/                     # Database layer
│   └── core/                   # Shared business logic
│
└── package.json
```

## Data Storage

### Global Database

Located at `~/.ralph-looper/database.sqlite` - stores:
- Projects (metadata, paths)
- Cross-project statistics

### Project Database

Located at `.ralph-looper/database.sqlite` - stores:
- Sections and items
- Iterations
- Status snapshots
- Usage tracking
- Prompt templates

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/ralph-looper.git
cd ralph-looper

# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev

# Type check
bun run typecheck
```

### Running from Source

```bash
# Link globally
bun link

# Now you can use ralph-looper command
ralph-looper --help
```

## Roadmap

- [x] Phase 1: Foundation (Project setup, database, CLI framework)
- [x] Phase 2: Task Management (Import, filtering, status tracking)
- [x] Phase 3: Loop Runner (Claude Code integration, output parsing)
- [x] Phase 4: MCP Server (Full tool implementation)
- [ ] Phase 5: Enhanced UX (Progress bars, rich UI)
- [ ] Phase 6: Advanced Features (Reporting, analytics)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Geoffrey Huntley](https://twitter.com/geoffreyhuntley) - Creator of Ralph Wiggum technique
- [Anthropic](https://www.anthropic.com) - Claude Code and MCP
- [Drizzle ORM](https://orm.drizzle.team) - Excellent TypeScript ORM
- All contributors to this project

---

Made with ❤️ by the Ralph Looper team
