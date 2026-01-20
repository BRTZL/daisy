# Daisy

## What is Daisy?

A TypeScript CLI tool and MCP server for **continuous autonomous AI development**. It implements the "Ralph Wiggum" technique (named by Geoffrey Huntley) - managing infinite loops where Claude Code works on tasks, and when it tries to exit, a hook intercepts and feeds the same task back for continuous iteration.

## Key Features

- Task-based project management with recursive task trees
- Multi-iteration loop execution with Claude Code
- Real-time terminal UI (TUI) for monitoring
- MCP server integration for Claude Code tools
- Token usage and cost tracking
- Webhook notifications for external integrations

## Version

- Current: 2.1.0
- License: MIT
- Node.js: >=18.0.0

---

## Technology Stack

### Core

- **TypeScript** 5.7.2 - Strict mode, ES2022 target, ESM modules
- **Node.js** 18+ - Runtime environment

### CLI Framework

- **Commander.js** 12.1.0 - CLI argument parsing and commands
- **chalk** 5.4.1 - Terminal colors
- **ora** 8.1.1 - Terminal spinners
- **inquirer** 12.3.0 - Interactive prompts
- **cli-progress** 3.12.0 - Progress bars

### MCP (Model Context Protocol)

- **@modelcontextprotocol/sdk** 1.0.4 - Claude Code integration

### Terminal UI

- **Ink** 6.6.0 - React for terminal UIs
- **React** 19.2.3 - Component framework

### Validation

- **Zod** 3.24.1 - TypeScript-first schema validation

### Build & Development

- **tsup** 8.3.5 - TypeScript bundler
- **tsx** 4.19.2 - TypeScript executor
- **Biome** 2.3.11 - Linting and formatting
- **Vitest** 2.1.8 - Testing framework

---

## Architecture

### Directory Structure

```
src/
├── cli/                  # CLI layer
│   ├── index.ts         # Main entry (Commander.js program)
│   ├── commands/        # Individual commands
│   │   ├── init.ts      # Project initialization
│   │   ├── run.ts       # Start Daisy loop
│   │   ├── plan.ts      # Interactive planning with Claude
│   │   ├── tasks.ts     # Task management
│   │   ├── status.ts    # Project status
│   │   ├── tui.ts       # Terminal UI
│   │   ├── data.ts      # Import/export
│   │   └── completions.ts # Shell completions
│   └── completions/     # Shell completion scripts
│       ├── bash.ts      # Bash completions
│       ├── zsh.ts       # Zsh completions
│       └── fish.ts      # Fish completions
│
├── core/                 # Core business logic
│   ├── loop-runner.ts   # LoopRunner class (EventEmitter)
│   ├── parser.ts        # Claude stream-json parser
│   ├── types.ts         # Shared type definitions
│   ├── planning-chat.ts # Claude Code subprocess for planning
│   ├── planning-session.ts # Planning session management
│   ├── planning-prompt.ts # Planning system prompt
│   ├── webhook-service.ts # Webhook notifications
│   └── webhook-types.ts # Webhook type definitions
│
├── storage/              # Data persistence (JSON files)
│   ├── project.ts       # Project-specific operations
│   ├── types.ts         # Storage type definitions
│   └── index.ts         # Exports
│
├── mcp/                  # MCP server
│   ├── index.ts         # MCP entry point
│   └── server.ts        # MCP tools implementation
│
├── tui/                  # Terminal UI (React/Ink)
│   ├── index.tsx        # TUI entry point
│   ├── App.tsx          # Main component
│   ├── session-summary.ts
│   └── components/      # React components
│
└── index.ts             # Library exports

schemas/                  # JSON Schema definitions
├── config.schema.json
├── tasks.schema.json
└── state.schema.json
```

### Layer Responsibilities

1. **CLI** - User-facing commands, argument parsing, output formatting
2. **Core** - Business logic, loop orchestration, AI integration
3. **Storage** - JSON file persistence, no database
4. **MCP** - Claude Code tool integration via Model Context Protocol
5. **TUI** - Real-time React-based terminal interface

---

## Key Concepts

### Daisy Loop

An iteration cycle where:

1. Claude Code receives a task via dynamic prompt
2. Works on the task using MCP tools for status updates
3. Signals iteration complete via MCP tool
4. Loop runner starts next iteration with fresh context

### Signal Files

Inter-process communication between LoopRunner and MCP server:

- Location: `.daisy/.signal`
- Actions: `iteration_complete`, `all_complete`, `task_updated`

### Task Structure (Recursive)

```typescript
interface Task {
  id: string; // e.g., "setup-1"
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
  dependsOn?: string[]; // Task IDs that must complete first
  acceptanceCriteria?: string[];
  attempts?: number;
  maxAttempts?: number;
  skipReason?: string;
  completionSummary?: string;
  tasks?: Task[]; // Nested subtasks
}
```

### MCP Tools (Claude Code integration)

- `get_next_task` - Get pending task with dependencies met
- `list_tasks` - List/filter tasks
- `update_task_status` - Change task status
- `get_stats` - Task statistics
- `signal_iteration_complete` - End current iteration

---

## Development Commands

### Building

```bash
npm run build          # Production build with tsup
npm run dev            # Watch mode for development
```

### Code Quality

```bash
npm run check          # Biome lint/format check
npm run check:fix      # Auto-fix lint/format issues
npm run typecheck      # TypeScript type checking (tsc --noEmit)
```

### Testing

```bash
npm run test           # Run Vitest tests
```

### Running Locally

```bash
npm link               # Link for global testing
daisy --help           # Test CLI
```

---

## Code Style & Conventions

### Biome Configuration (biome.json)

- **Indent**: 2 spaces
- **Line width**: 80 characters
- **Line ending**: LF
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Trailing commas**: ES5 style
- **Arrow parens**: Always

### TypeScript

- Strict mode enabled
- ES2022 target
- ESM modules (import/export)
- Use `.js` extension in imports (for ESM compatibility)

### Naming Conventions

- **Files**: kebab-case (e.g., `loop-runner.ts`)
- **Classes**: PascalCase (e.g., `LoopRunner`)
- **Functions**: camelCase (e.g., `getTasks`)
- **Constants**: UPPER_SNAKE_CASE or camelCase
- **Types/Interfaces**: PascalCase (e.g., `Task`, `ProjectConfig`)

### Import Order

1. Node.js built-ins (with `node:` prefix)
2. External dependencies
3. Internal modules (relative paths)

### Patterns

- **EventEmitter** for async lifecycle events
- **Zod** for runtime validation
- **Commander** for CLI with `.action(async () => {})` handlers
- **chalk** for colored output
- **ora** for spinners

### Error Handling

```typescript
const spinner = ora("Loading...").start();
try {
  // operation
  spinner.succeed("Done");
} catch (error) {
  spinner.fail("Failed");
  console.error(chalk.red((error as Error).message));
  process.exit(1);
}
```

---

## Git Conventions

### Conventional Commits

All commits MUST follow the conventional commits format:

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style/formatting (no logic change)
- `refactor:` - Code restructuring
- `test:` - Adding or modifying tests
- `chore:` - Maintenance tasks

### Examples

```
feat: add webhook retry mechanism
fix: correct token counting in parser
docs: update README with new CLI options
refactor: extract task validation to separate function
test: add unit tests for LoopRunner
chore: update dependencies
```

### Branch Naming

- `feat/description` - Feature branches
- `fix/description` - Bug fix branches
- `chore/description` - Maintenance branches

---

## Critical Files Reference

### Entry Points

- `src/cli/index.ts` - CLI entry (bin: daisy)
- `src/mcp/index.ts` - MCP server entry (bin: daisy-mcp)
- `src/index.ts` - Library exports

### Core Logic

- `src/core/loop-runner.ts` - Main loop orchestration
- `src/core/parser.ts` - Claude output parser
- `src/core/planning-chat.ts` - Claude Code subprocess for planning
- `src/core/planning-session.ts` - Planning session management

### Storage

- `src/storage/project.ts` - Task CRUD operations
- `src/storage/types.ts` - All storage types

### Schemas

- `schemas/tasks.schema.json` - Task structure validation
- `schemas/config.schema.json` - Config validation

### Project Files (created by `init`)

- `.daisy/config.json` - Project configuration
- `.daisy/tasks.json` - Task definitions
- `.daisy/state.json` - Iteration state
- `.daisy/PROMPT.md` - Base prompt template
- `.daisy/.signal` - IPC signal file

---

## Common Modifications

### Adding/Removing CLI Commands

**IMPORTANT:** When adding or removing CLI commands, you MUST update ALL of the following:

1. **Command file** - Create/delete `src/cli/commands/your-command.ts`
2. **CLI registration** - Add/remove import and `program.addCommand()` in `src/cli/index.ts`
3. **Shell completions** - Update ALL three completion scripts:
   - `src/cli/completions/bash.ts`
   - `src/cli/completions/zsh.ts`
   - `src/cli/completions/fish.ts`
4. **Verify** - Run `daisy --help` and test completions work correctly

Example command structure:
```typescript
import { Command } from "commander";
export const yourCommand = new Command("your-command")
  .description("Description")
  .argument("[arg]", "Argument description")
  .option("-o, --option <value>", "Option description")
  .action(async (arg, options) => {
    // implementation
  });
```

Register in `src/cli/index.ts`:
```typescript
import { yourCommand } from "./commands/your-command.js";
program.addCommand(yourCommand);
```

### Adding an MCP Tool

1. Edit `src/mcp/server.ts`
2. Add tool definition in `ListToolsRequestSchema` handler
3. Add handler case in `CallToolRequestSchema` handler
4. Tool returns: `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

### Modifying Task Structure

1. Update `src/storage/types.ts` - TypeScript interface
2. Update `schemas/tasks.schema.json` - JSON Schema
3. Update any affected functions in `src/storage/project.ts`

### Adding a Webhook Event

1. Add event type in `src/core/webhook-types.ts`
2. Emit event in `src/core/loop-runner.ts` using `WebhookService`
