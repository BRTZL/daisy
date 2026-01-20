# Architecture Overview

This document describes the system architecture of Daisy, explaining how all components work together to enable continuous autonomous AI development.

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    │
│   │   CLI (daisy)    │    │     Web UI       │    │  Marketing Site  │    │
│   │   Commander.js   │    │   React + Vite   │    │   Static HTML    │    │
│   └────────┬─────────┘    └────────┬─────────┘    └──────────────────┘    │
│            │                       │                                       │
└────────────┼───────────────────────┼───────────────────────────────────────┘
             │                       │
             │  HTTP REST            │  WebSocket + HTTP
             │                       │
┌────────────▼───────────────────────▼───────────────────────────────────────┐
│                              HTTP SERVER                                    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │                      Hono Framework                                 │  │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │  │
│   │   │  REST API    │  │ Static Files │  │  WebSocket Server    │    │  │
│   │   │  /api/*      │  │  /dist/web   │  │  Real-time updates   │    │  │
│   │   └──────────────┘  └──────────────┘  └──────────────────────┘    │  │
│   └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              SERVICES                                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────────────────┐  ┌─────────────────────────────────┐    │
│   │       Loop Service          │  │      Planning Service           │    │
│   │                             │  │                                 │    │
│   │  - Spawns Claude processes  │  │  - Interactive planning chat   │    │
│   │  - Manages iteration state  │  │  - Task creation/modification  │    │
│   │  - Broadcasts WebSocket     │  │  - Uses PlanningSession        │    │
│   │  - Accumulates token usage  │  │                                 │    │
│   └─────────────┬───────────────┘  └─────────────────────────────────┘    │
│                 │                                                          │
└─────────────────┼──────────────────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         CLAUDE CODE INTEGRATION                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────────────────┐  ┌─────────────────────────────────┐    │
│   │   Claude Code Subprocess    │  │         MCP Server              │    │
│   │                             │  │                                 │    │
│   │  - Receives dynamic prompt  │◄─│  - get_next_task               │    │
│   │  - stream-json output       │  │  - update_task_status          │    │
│   │  - Uses MCP tools           │─►│  - signal_iteration_complete   │    │
│   │                             │  │  - Planning tools               │    │
│   └─────────────┬───────────────┘  └──────────────┬──────────────────┘    │
│                 │                                  │                       │
│                 │      Signal File (.signal)       │                       │
│                 └────────────────┬─────────────────┘                       │
│                                  │                                         │
└──────────────────────────────────┼─────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE LAYER                                     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │  tasks.json     │  │  config.json    │  │  history.json   │           │
│   │  Task tree      │  │  Loop settings  │  │  Past sessions  │           │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│                                                                            │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│   │  PROMPT.md      │  │  .signal        │  │  activity.md    │           │
│   │  Base prompt    │  │  IPC signals    │  │  Open-loop log  │           │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘           │
│                                                                            │
│   Location: .daisy/ directory in project root                              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Component Layers

### 1. CLI Layer (`src/cli/`)

The command-line interface provides user-facing commands for project management.

```
src/cli/
├── index.ts              # Main entry, Commander.js setup
└── commands/
    ├── init.ts           # Project initialization
    ├── install.ts        # Daemon installation
    ├── uninstall.ts      # Daemon removal
    ├── start.ts          # Start daemon
    ├── stop.ts           # Stop daemon
    ├── open.ts           # Open web UI
    └── use.ts            # Switch projects
```

**Responsibilities**:
- Parse command-line arguments
- Provide user feedback (spinners, colors, prompts)
- Delegate to core services
- Manage daemon lifecycle

**Dependencies**: Commander.js, chalk, ora, inquirer

### 2. Core Layer (`src/core/`)

Business logic for loop execution, parsing, and planning.

```
src/core/
├── loop-runner.ts        # Task-based loop orchestration
├── open-loop-runner.ts   # Open-ended loop variant
├── parser.ts             # Claude stream-json parser
├── types.ts              # Shared type definitions
├── planning-chat.ts      # Claude subprocess for planning
├── planning-session.ts   # Multi-turn planning sessions
├── planning-prompt.ts    # Planning system prompt generator
├── planning-response.ts  # Zod schemas for planning responses
├── interactive-prompt.ts # User question presentation
├── webhook-service.ts    # Webhook notification delivery
└── webhook-types.ts      # Webhook type definitions
```

**Responsibilities**:
- Orchestrate Claude Code execution
- Parse structured output
- Manage planning conversations
- Send webhook notifications

### 3. Storage Layer (`src/storage/`)

File-based persistence using JSON files.

```
src/storage/
├── index.ts              # Export aggregation
├── project.ts            # Task CRUD, config management
└── types.ts              # Type definitions
```

**Responsibilities**:
- Read/write JSON files
- Task tree manipulation
- Dependency validation
- Session history tracking

### 4. MCP Server (`src/mcp/`)

Model Context Protocol server for Claude Code integration.

```
src/mcp/
├── index.ts              # Entry point for MCP subprocess
└── server.ts             # Tool definitions and handlers
```

**Responsibilities**:
- Expose tools to Claude Code
- Handle task queries and updates
- Write signal files for IPC
- Validate planning operations

### 5. HTTP Server (`src/server/`)

Hono-based HTTP server with WebSocket support.

```
src/server/
├── index.ts              # Server startup
├── app.ts                # Hono app configuration
├── routes/
│   └── api.ts            # REST API endpoints
└── services/
    ├── loop-service.ts   # Loop execution management
    └── planning-service.ts # Planning session management
```

**Responsibilities**:
- Serve REST API endpoints
- Broadcast WebSocket updates
- Manage loop execution state
- Serve static web assets

### 6. Daemon Layer (`src/daemon/`)

macOS daemon management for background operation.

```
src/daemon/
├── index.ts              # Export aggregation
├── launchd.ts            # macOS launchd integration
└── hosts.ts              # /etc/hosts management
```

**Responsibilities**:
- Install/uninstall launchd plist
- Manage daemon lifecycle
- Configure DNS for daisy.test

### 7. Web UI (`src/web/`)

React-based dashboard for monitoring and management.

```
src/web/
├── src/
│   ├── App.tsx           # Main application component
│   ├── main.tsx          # React entry point
│   ├── components/       # UI components
│   ├── hooks/            # React hooks (WebSocket)
│   └── lib/              # API client, utilities
├── vite.config.ts        # Build configuration
└── tailwind.config.ts    # Styling configuration
```

**Responsibilities**:
- Real-time loop monitoring
- Task management interface
- Planning chat interface
- Session history display

## Data Flow

### Loop Execution Flow

```
1. User starts loop (CLI or Web UI)
                │
                ▼
2. Loop Service initializes
   - Sets running = true
   - Creates session record
   - Broadcasts status via WebSocket
                │
                ▼
3. For each iteration:
   ┌────────────────────────────────────────┐
   │ a. Generate dynamic prompt              │
   │    - Read base PROMPT.md                │
   │    - Get current task from storage      │
   │    - Build task context                 │
   │                                         │
   │ b. Spawn Claude Code process            │
   │    - Pass prompt via stdin              │
   │    - --output-format stream-json        │
   │    - --mcp-config (MCP server path)     │
   │                                         │
   │ c. Claude executes                      │
   │    - Uses MCP tools                     │
   │    - Updates task status                │
   │    - Signals iteration complete         │
   │                                         │
   │ d. Loop Service monitors                │
   │    - Watches .signal file               │
   │    - Parses stdout for tokens           │
   │    - Broadcasts logs via WebSocket      │
   │                                         │
   │ e. Iteration ends                       │
   │    - Accumulate token usage             │
   │    - Check if all tasks complete        │
   │    - 2-second pause before next         │
   └────────────────────────────────────────┘
                │
                ▼
4. Loop ends when:
   - All tasks completed
   - Max iterations reached
   - User stops manually
                │
                ▼
5. Cleanup
   - Save session to history
   - Broadcast loop-complete
   - Show browser notification
```

### Signal File IPC

The signal file (`.daisy/.signal`) enables communication between the MCP server and Loop Service:

```
┌─────────────────┐         ┌─────────────────┐
│  Claude Code    │         │   Loop Service  │
│  (subprocess)   │         │   (parent)      │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  Uses MCP tool            │
         │  update_task_status()     │
         ▼                           │
┌─────────────────┐                  │
│   MCP Server    │                  │
│                 │                  │
│ Writes signal:  │                  │
│ {               │                  │
│   "action":     │                  │
│     "iteration_ │──── file ────────► fs.watch()
│      complete", │     write        │ detects change
│   "timestamp":  │                  │
│     "..."       │                  │
│ }               │                  │
└─────────────────┘                  │
                                     │
                                     ▼
                              Process signal:
                              - Kill Claude process
                              - Start next iteration
                              - Or end loop
```

**Signal Actions**:
- `task_updated` - Task status changed (for UI refresh)
- `iteration_complete` - Current iteration done, continue to next
- `all_complete` - All tasks done, end loop
- `loop_complete` - Explicit loop end (open-ended mode)

### WebSocket Messages

The server broadcasts real-time updates to connected Web UI clients:

| Message Type | Data | Purpose |
|--------------|------|---------|
| `loop-status` | Full LoopStatus object | State sync |
| `stats` | Task statistics | Update counters |
| `log` | { text, timestamp, level } | Log streaming |
| `iteration-start` | { iteration, maxIterations } | Iteration began |
| `iteration-complete` | { iteration, usage, complete } | Iteration ended |
| `task-updated` | null | Trigger refetch |
| `loop-complete` | null | Loop finished |
| `error` | { message } | Error occurred |

## File Persistence

All data is stored in JSON files within `.daisy/`:

### tasks.json

Recursive task tree structure:

```json
[
  {
    "id": "setup",
    "title": "Project Setup",
    "status": "completed",
    "completedAt": "2024-01-15T10:30:00Z",
    "tasks": [
      {
        "id": "setup-db",
        "title": "Database Setup",
        "status": "completed"
      }
    ]
  },
  {
    "id": "feature-auth",
    "title": "Authentication",
    "status": "pending",
    "dependsOn": ["setup"]
  }
]
```

### config.json

Project configuration:

```json
{
  "loop": {
    "maxIterations": 10,
    "maxAttemptsPerTask": 3
  },
  "webhooks": [
    {
      "name": "Slack",
      "url": "https://hooks.slack.com/...",
      "events": ["task_completed", "error"],
      "active": true,
      "secret": "hmac-secret"
    }
  ]
}
```

### history.json

Session history (max 100 entries):

```json
{
  "sessions": [
    {
      "id": "session-abc123",
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T11:30:00Z",
      "iterations": 15,
      "mode": "task-based",
      "usage": {
        "inputTokens": 150000,
        "outputTokens": 45000,
        "costUsd": 2.45
      },
      "tasksCompleted": ["setup", "setup-db", "feature-auth"],
      "status": "completed"
    }
  ]
}
```

## Process Architecture

### Daemon Mode (Production)

```
┌────────────────────────────────────────────────────────────┐
│                    macOS launchd                            │
│                                                            │
│   Plist: ~/Library/LaunchAgents/com.daisy.daemon.plist    │
│   RunAtLoad: true                                          │
│   KeepAlive: true                                          │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                    Daisy Server Process                     │
│                                                            │
│   - HTTP server on port 4141                               │
│   - WebSocket server on /ws                                │
│   - Serves web UI from dist/web                            │
│   - Manages loop execution                                  │
│                                                            │
│   Logs: ~/Library/Logs/daisy/stdout.log                    │
│         ~/Library/Logs/daisy/stderr.log                    │
└────────────────────────────────────────────────────────────┘
```

### Development Mode

```
Terminal 1:                    Terminal 2:
┌─────────────────────┐       ┌─────────────────────┐
│  npm run dev:server │       │  npm run dev:web    │
│                     │       │                     │
│  Watches src/server │       │  Vite dev server    │
│  Reloads on change  │       │  Port 5173          │
│  Port 4141          │◄──────│  Proxies /api, /ws  │
└─────────────────────┘       └─────────────────────┘
```

## Technology Stack Details

### Build System

```
┌──────────────────┐     ┌──────────────────┐
│      tsup        │     │      Vite        │
│                  │     │                  │
│  Builds:         │     │  Builds:         │
│  - CLI           │     │  - Web UI        │
│  - Core          │     │  - React app     │
│  - Storage       │     │  - Tailwind CSS  │
│  - MCP           │     │                  │
│  - Server        │     │                  │
│  - Daemon        │     │                  │
│                  │     │                  │
│  Output:         │     │  Output:         │
│  dist/           │     │  dist/web/       │
└──────────────────┘     └──────────────────┘
```

### Dependency Graph

```
CLI
 ├── Commander.js (argument parsing)
 ├── chalk (colors)
 ├── ora (spinners)
 ├── inquirer (prompts)
 └── open (browser launch)

Core
 ├── EventEmitter (Node.js)
 └── Zod (validation)

MCP Server
 └── @modelcontextprotocol/sdk

HTTP Server
 ├── Hono (HTTP framework)
 ├── ws (WebSocket)
 └── @hono/node-server

Web UI
 ├── React 19
 ├── @tanstack/react-query
 ├── @dnd-kit/* (drag-drop)
 ├── @radix-ui/* (primitives)
 ├── Tailwind CSS
 └── lucide-react (icons)
```

## Security Considerations

1. **Local Only**: Server binds to 127.0.0.1 by default
2. **No Authentication**: Designed for local development use
3. **Webhook Secrets**: HMAC-SHA256 signing for webhooks
4. **Permissions**: Claude Code permissions managed via `.claude/settings.json`
5. **Sudo Requirements**: /etc/hosts modification requires sudo

## Extensibility Points

### Adding CLI Commands

1. Create `src/cli/commands/new-command.ts`
2. Register in `src/cli/index.ts`
3. Update shell completions

### Adding MCP Tools

1. Add tool definition in `src/mcp/server.ts` ListToolsRequestSchema
2. Add handler in CallToolRequestSchema switch statement

### Adding Webhook Events

1. Add event type in `src/core/webhook-types.ts`
2. Emit event in `src/core/loop-runner.ts` or `src/server/services/loop-service.ts`

### Adding API Endpoints

1. Add route in `src/server/routes/api.ts`
2. Create service in `src/server/services/` if needed

## Related Documentation

- [CLI Commands](./cli-commands.md) - Detailed command reference
- [MCP Server](./mcp-server.md) - Tool specifications
- [Storage](./storage.md) - Data model details
- [Configuration](./configuration.md) - All configuration options
