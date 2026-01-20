# Daisy

> AI-powered task planning and execution for Claude Code

A comprehensive TypeScript-based CLI tool and MCP server for managing automated AI development loops with Claude Code. The tool combines project management, task tracking, loop execution, and MCP integration in one powerful package.

## What is Daisy?

Daisy is built on the [Ralph Wiggum](https://devinterrupted.substack.com/p/inventing-the-ralph-wiggum-loop-creator) technique created by Geoffrey Huntley that uses infinite loops to enable continuous autonomous AI development. The concept is simple yet powerful:

```bash
while :; do cat PROMPT.md | claude-code ; done
```

Claude Code works on a task, and when it tries to exit, a hook intercepts the exit and feeds the same task back, creating continuous iteration. Daisy makes this process manageable, trackable, and powerful.

## Features

- **Task Tracking** - Recursive task structure with dependencies and acceptance criteria
- **Loop Runner** - Execute continuous AI development loops
- **Terminal UI** - Rich terminal interface with task progress and output panels
- **Progress Monitoring** - Real-time status updates and iteration tracking
- **MCP Server** - Native Model Context Protocol integration for Claude Code
- **Rich CLI** - Interactive commands with filtering, progress bars, and colorful output
- **Lightweight Storage** - JSON file-based storage (no database dependencies)

## Installation

### Global Installation

```bash
npm install -g plan-with-daisy
# or
bun install -g plan-with-daisy
```

### Using npx (No Installation)

```bash
npx plan-with-daisy init
```

## Quick Start

### 1. Initialize a Project

```bash
daisy init ./my-project
```

This creates:
- `.daisy/` directory with config and task files
- `PROMPT.md` template
- Imports existing `tasks.json` if present

### 2. View Tasks

```bash
daisy tasks
```

Filter tasks by status:
```bash
daisy tasks --status pending
daisy tasks --filter "auth"
```

### 3. Check Status

```bash
daisy status
```

### 4. Start Daisy Loop

```bash
daisy run 10
```

## CLI Commands

### Initialization

```bash
# Initialize a new project in current directory
daisy init

# Initialize in a specific path
daisy init ./my-project
```

### Task Management

```bash
# List all tasks
daisy tasks

# Filter by status
daisy tasks --status pending

# Search tasks
daisy tasks --filter "auth"

# Show all nested tasks
daisy tasks --all

# Import tasks from file
daisy tasks import [file]
```

### Loop Management

```bash
# Start Daisy loop (10 iterations)
daisy run 10
```

### Status & Data

```bash
# Show current status
daisy status

# Output as JSON
daisy status --json

# Export project data
daisy data export [file]

# Import project data
daisy data import <file>
```

### MCP Server

```bash
# Start MCP server (for Claude Desktop)
daisy mcp
```

## MCP Server Integration

### Claude Desktop Setup

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "daisy": {
      "command": "node",
      "args": ["/path/to/node_modules/.bin/daisy-mcp"],
      "env": {
        "DAISY_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

### Available MCP Tools

1. **get_current_project** - Get active project and status
2. **list_tasks** - List/filter tasks by status or task ID
3. **get_next_task** - Get the next available task (pending, dependencies met)
4. **update_task_status** - Update a specific task's status
5. **get_stats** - Get task, conversation, and iteration statistics
6. **signal_iteration_complete** - Signal that current iteration is complete

## Task Format

Tasks support a recursive structure with dependencies:

```json
[
  {
    "id": "auth",
    "title": "Authentication System",
    "description": "Implement user authentication",
    "status": "pending",
    "acceptanceCriteria": [
      "Users can sign up",
      "Users can log in",
      "Sessions persist"
    ],
    "tasks": [
      {
        "id": "auth-signup",
        "title": "Sign Up Flow",
        "status": "pending"
      },
      {
        "id": "auth-login",
        "title": "Login Flow",
        "status": "pending",
        "dependsOn": ["auth-signup"]
      }
    ]
  }
]
```

### Task Status Values

- `pending` - Not started
- `in_progress` - Currently being worked on
- `completed` - Successfully finished
- `skipped` - Skipped (with optional reason)
- `blocked` - Blocked by external factors

## Project Structure

```
your-project/
├── .daisy/                     # Project config directory
│   ├── config.json             # Project configuration
│   ├── tasks.json              # Task definitions
│   ├── state.json              # Iteration state & usage
│   ├── conversation.jsonl      # Conversation history
│   └── PROMPT.md               # Prompt template
│
├── .claude/                    # Claude Code config
│   └── settings.json           # Permissions for Claude Code
│
└── tasks.json                  # (Optional) Source tasks file
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/plan-with-daisy/daisy.git
cd daisy

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run check
```

### Running from Source

```bash
# Link globally
npm link

# Now you can use daisy command
daisy --help
```

## Roadmap

- [x] Phase 1: Foundation (Project setup, storage, CLI framework)
- [x] Phase 2: Task Management (Import, filtering, recursive tasks)
- [x] Phase 3: Loop Runner (Claude Code integration, output parsing)
- [x] Phase 4: MCP Server (Full tool implementation)
- [ ] Phase 5: Enhanced UX (Progress bars, rich UI)
- [ ] Phase 6: Advanced Features (Reporting, analytics, webhooks)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- [Geoffrey Huntley](https://twitter.com/geoffreyhuntley) - Creator of Ralph Wiggum technique
- [Anthropic](https://www.anthropic.com) - Claude Code and MCP
- All contributors to this project

---

Made with love by the Daisy team
