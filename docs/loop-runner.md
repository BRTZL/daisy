# Loop Runner

The Loop Runner is the core component that orchestrates autonomous development loops. It manages Claude Code subprocesses, tracks iteration state, and handles inter-process communication.

## Overview

The Loop Runner:
- Spawns and manages Claude Code processes
- Generates dynamic prompts for each iteration
- Parses structured JSON output from Claude
- Watches signal files for completion notifications
- Accumulates token usage and costs
- Broadcasts real-time updates via WebSocket
- Sends webhook notifications

## Loop Runner Variants

### LoopRunner (Task-Based)

Located in `src/core/loop-runner.ts`

Works through a defined task list, one task per iteration:
- Gets next pending task with met dependencies
- Generates prompt focused on that specific task
- Tracks task completion status
- Ends when all tasks complete or max iterations reached

### OpenLoopRunner (Open-Ended)

Located in `src/core/open-loop-runner.ts`

Works without predefined tasks:
- Uses activity log for context
- Claude decides what to work on
- Continues until explicitly signaled complete
- Better for exploratory or undefined work

## Class Structure

```typescript
class LoopRunner extends EventEmitter {
  // Configuration
  private projectPath: string;
  private projectName: string;
  private maxIterations: number;
  private promptPath?: string;

  // Runtime state
  private activeProcess: ChildProcess | null;
  private parser: StreamParser;
  private isStopping: boolean;

  // Tracking
  private currentUsage: TokenUsage;
  private totalTokens: { input: number; output: number };
  private totalCost: number;
  private totalIterations: number;

  // Services
  private webhookService?: WebhookService;
}
```

## Initialization

```typescript
const runner = new LoopRunner({
  projectPath: "/path/to/project",
  projectName: "My Project",
  maxIterations: 10,
  promptPath: ".daisy/PROMPT.md",  // Optional custom path
  startingIteration: 1,            // Resume from iteration
  webhooks: [/* webhook configs */]
});
```

### Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `projectPath` | Yes | - | Project root directory |
| `projectName` | Yes | - | Display name |
| `maxIterations` | Yes | - | Maximum iterations |
| `promptPath` | No | `.daisy/PROMPT.md` | Base prompt file |
| `startingIteration` | No | 1 | Starting iteration number |
| `webhooks` | No | `[]` | Webhook configurations |

## Execution Flow

### 1. Start Loop

```typescript
await runner.start();
```

The `start()` method:
1. Emits `loop_started` webhook event
2. Iterates from `startingIteration` to `startingIteration + maxIterations`
3. For each iteration:
   - Emits `iteration-start` event
   - Calls `runIteration()`
   - Handles completion or continuation
4. Emits `loop_completed` webhook
5. Emits `done` event

### 2. Run Single Iteration

The `runIteration(iteration: number)` method:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Setup                                                    │
│     • Reset currentUsage to zeros                           │
│     • Clear signal file                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  2. Generate Prompt                                          │
│     • Read base PROMPT.md                                   │
│     • Get current task from storage                         │
│     • Build dynamic prompt with task context                │
│     • Write to .daisy/.temp/iteration-N-prompt.md           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  3. Spawn Claude Process                                     │
│     • command: claude                                       │
│     • args: ["-p", promptPath, "--output-format",           │
│              "stream-json", "--print", "--verbose"]         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  4. Watch Signal File                                        │
│     • fs.watch() on .daisy/ directory                       │
│     • Detect changes to .signal file                        │
│     • Parse signal JSON when changed                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  5. Process stdout                                           │
│     • Parse each chunk with StreamParser                    │
│     • Extract model info, text, tool calls                  │
│     • Accumulate token usage from result messages           │
│     • Emit 'output' event for each parsed result            │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  6. Handle Signal                                            │
│     • iteration_complete: End iteration, continue loop      │
│     • all_complete: End iteration, end loop                 │
│     • task_updated: Log update, continue                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  7. Cleanup                                                  │
│     • Flush parser buffer                                   │
│     • Close signal watcher                                  │
│     • Update totals (tokens, cost)                          │
│     • Emit 'iteration-complete' event                       │
│     • Return allComplete status                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Stop Loop

```typescript
runner.stop();
```

The `stop()` method:
1. Sets `isStopping = true`
2. Kills active process with SIGKILL
3. Loop will exit on next iteration check

## Prompt Generation

### Dynamic Prompt Structure

```markdown
## Iteration N of M

### CRITICAL RULES
- Complete ONLY the current task
- ONE TASK PER ITERATION
- Signal completion when done

### Task Status Summary
- Total: X tasks
- Completed: Y
- Pending: Z
- In Progress: W

### Already Completed Tasks (DO NOT REDO)
- ✓ task-1: Title
- ✓ task-2: Title

### Current Task
**ID**: current-task
**Title**: Current Task Title
**Description**: Detailed description...

**Acceptance Criteria**:
1. Criterion one
2. Criterion two

**Dependencies**: [dep-1, dep-2]

### Instructions
When you complete this task:
1. Call update_task_status(taskId, "completed", summary)
2. Call signal_iteration_complete()

### Remaining Pending Tasks (DO NOT WORK ON YET)
- ○ task-3: Future task
- ○ task-4: Another future task

---

[Contents of PROMPT.md]
```

### Prompt File Location

Generated prompts are written to:
```
.daisy/.temp/iteration-{N}-prompt.md
```

This allows debugging of what Claude received.

## Stream Parser

The `StreamParser` class parses Claude's `stream-json` output format.

### Input Format

Claude outputs newline-delimited JSON:

```json
{"type":"system","subtype":"init","model":"claude-opus-4-5-20251101"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Working on..."}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"update_task_status"}]}}
{"type":"result","result":"success","usage":{"input_tokens":1500,"output_tokens":500}}
```

### Output Format

```typescript
interface ParseResult {
  type: string;           // "init", "assistant", "result", "system"
  text?: string;          // Text content from assistant
  toolName?: string;      // Tool being used
  model?: string;         // Model name
  sessionId?: string;     // Session identifier
  inputTokens: number;    // Token counts
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  isComplete: boolean;    // COMPLETE marker found
  result?: string;        // Raw result string
  totalCostUsd?: number;  // Cost in USD
}
```

### Buffer Handling

The parser accumulates partial lines:

```typescript
class StreamParser {
  private buffer: string = "";

  parse(chunk: string): ParseResult[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || ""; // Keep incomplete line
    return lines.map(line => this.parseLine(line)).filter(Boolean);
  }

  flush(): ParseResult | null {
    if (this.buffer) {
      const result = this.parseLine(this.buffer);
      this.buffer = "";
      return result;
    }
    return null;
  }
}
```

## Signal Handling

### Signal File Format

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

| Action | Behavior |
|--------|----------|
| `iteration_complete` | End current iteration, continue to next |
| `all_complete` | End iteration and loop (all tasks done) |
| `loop_complete` | End loop immediately (open-ended mode) |
| `task_updated` | Log update, continue watching |

### Signal Watcher

```typescript
const watcher = fs.watch(daisyDir, (eventType, filename) => {
  if (filename === '.signal' || filename === 'signal.json') {
    const signal = readSignal(projectPath);
    if (signal) {
      switch (signal.action) {
        case 'iteration_complete':
          // Kill process gracefully
          break;
        case 'all_complete':
          allComplete = true;
          // Kill process
          break;
        // ...
      }
    }
  }
});
```

## Events

The LoopRunner extends EventEmitter and emits these events:

### `iteration-start`

```typescript
runner.on('iteration-start', (iteration: number) => {
  console.log(`Starting iteration ${iteration}`);
});
```

### `iteration-complete`

```typescript
runner.on('iteration-complete', (
  iteration: number,
  usage: TokenUsage,
  allComplete: boolean
) => {
  console.log(`Iteration ${iteration} done, tokens: ${usage.inputTokens}`);
});
```

### `output`

```typescript
runner.on('output', (data: ParseResult) => {
  if (data.text) {
    console.log(`Claude: ${data.text}`);
  }
});
```

### `tasks-updated`

```typescript
runner.on('tasks-updated', () => {
  console.log('Task status changed');
});
```

### `complete`

```typescript
runner.on('complete', () => {
  console.log('All tasks completed!');
});
```

### `done`

```typescript
runner.on('done', () => {
  console.log('Loop finished');
});
```

### `error`

```typescript
runner.on('error', (error: Error) => {
  console.error('Loop error:', error);
});
```

## Webhook Integration

The LoopRunner can send webhook notifications:

### Emitted Events

```typescript
// Loop started
webhookService.emit('loop_started', {
  maxIterations: 10
});

// Iteration started
webhookService.emit('iteration_started', {
  iteration: 1,
  maxIterations: 10
});

// Iteration completed
webhookService.emit('iteration_completed', {
  iteration: 1,
  maxIterations: 10,
  tokens: { input: 1500, output: 500 },
  cost: 0.05,
  complete: false
});

// Loop completed
webhookService.emit('loop_completed', {
  totalIterations: 5,
  allTasksComplete: true,
  totalTokens: { input: 7500, output: 2500 },
  totalCost: 0.25
});

// Error
webhookService.emit('error', {
  message: 'Process failed',
  iteration: 3
});
```

## Token Tracking

### Per-Iteration

```typescript
private currentUsage: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreateTokens: 0,
  cacheReadTokens: 0,
  costUsd: 0
};
```

Accumulated from each `result` message in Claude's output.

### Total Across Loop

```typescript
private totalTokens = { input: 0, output: 0 };
private totalCost = 0;
private totalIterations = 0;
```

Updated at end of each iteration.

## Error Handling

### Process Errors

```typescript
process.on('error', (error) => {
  this.emit('error', error);
  // Cleanup and continue or stop
});
```

### Signal File Errors

```typescript
try {
  const signal = readSignal(projectPath);
} catch (error) {
  // Ignore parse errors, continue watching
}
```

### Graceful Shutdown

SIGINT/SIGTERM handlers for graceful shutdown:

```typescript
const sigHandler = () => {
  this.isStopping = true;
  if (this.activeProcess) {
    this.activeProcess.kill('SIGTERM');
  }
};

process.on('SIGINT', sigHandler);
process.on('SIGTERM', sigHandler);
```

## OpenLoopRunner Differences

The OpenLoopRunner variant differs in:

### 1. No Task Context

Instead of task-specific prompts, it includes:
- Activity log from `.daisy/activity.md`
- Instructions to continue working
- Request to append summaries to activity log

### 2. Different Completion Signal

Uses `loop_complete` action to signal all work done:

```typescript
signal_iteration_complete({ completeLoop: true })
```

### 3. Activity Log Format

```markdown
## Iteration 1 - 2024-01-15T10:00:00Z

Analyzed codebase structure and identified key components.
Set up initial project configuration.

## Iteration 2 - 2024-01-15T10:15:00Z

Implemented user authentication module.
Added tests for login flow.
```

### 4. Prompt Structure

```markdown
## Iteration N

### Previous Activity
[Contents of activity.md]

### Instructions
- Review the activity log above
- Continue working on the project
- Append a summary of your work to .daisy/activity.md
- Call signal_iteration_complete() when ready
- Use completeLoop: true when all work is done

[Contents of PROMPT.md]
```

## Usage in Server

The LoopService (`src/server/services/loop-service.ts`) wraps LoopRunner:

```typescript
class LoopService {
  private runner?: LoopRunner;
  private clients: Set<WebSocket>;

  async start(options) {
    this.runner = new LoopRunner({
      projectPath: this.projectPath,
      projectName: this.projectName,
      maxIterations: options.maxIterations,
      webhooks: this.webhooks
    });

    this.runner.on('iteration-start', (iteration) => {
      this.broadcast({ type: 'iteration-start', data: { iteration } });
    });

    this.runner.on('output', (data) => {
      if (data.text) {
        this.log(data.text);
      }
    });

    await this.runner.start();
  }

  stop() {
    this.runner?.stop();
  }
}
```

## Related Documentation

- [Core Concepts](./core-concepts.md) - Fundamental concepts
- [MCP Server](./mcp-server.md) - Tool specifications
- [Architecture](./architecture.md) - System design
- [Webhooks](./webhooks.md) - Webhook configuration
