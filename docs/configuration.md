# Configuration

This document covers all configuration options in Daisy, including project config, Claude Code permissions, and MCP server setup.

## Configuration Files

Daisy uses several configuration files:

| File | Purpose |
|------|---------|
| `.daisy/config.json` | Project-specific settings |
| `.claude/settings.json` | Claude Code permissions |
| `.mcp.json` | MCP server configuration |
| `.daisy/PROMPT.md` | Base prompt template |
| `~/.daisy/projects.json` | Global project list |

## Project Configuration

Located at `.daisy/config.json`:

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
      "name": "Slack",
      "url": "https://hooks.slack.com/...",
      "events": ["task_completed", "error"],
      "active": true,
      "secret": "signing-secret"
    }
  ]
}
```

### Loop Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxIterations` | number | 10 | Maximum loop iterations |
| `maxAttemptsPerTask` | number | 3 | Attempts before auto-skip |

**maxIterations**

The maximum number of iterations before the loop automatically stops:
- Set higher for complex projects
- Use `null` or omit for unlimited (controlled via UI)
- Each iteration = one Claude Code execution

**maxAttemptsPerTask**

How many times to retry a task before skipping:
- Counter resets if task is manually set back to pending
- Skipped tasks get `skipReason` set
- Lower values prevent getting stuck

### Prompt Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `templatePath` | string | `.daisy/PROMPT.md` | Custom prompt location |

**templatePath**

Relative path to a custom prompt template:
- Relative to project root
- Falls back to `.daisy/PROMPT.md` if not found
- Supports any `.md` file

### Webhook Settings

See [Webhooks](./webhooks.md) for detailed configuration.

## Claude Code Permissions

Located at `.claude/settings.json`:

```json
{
  "allow": [
    "Skill(frontend-design:frontend-design)",
    "mcp__daisy",
    "mcp__chrome-devtools",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash(git:*)",
    "Bash(npm:*)",
    "Bash(npx:*)",
    "Bash(node:*)",
    "Bash(bun:*)",
    "Bash(pnpm:*)",
    "Bash(yarn:*)",
    "Bash(make:*)",
    "Bash(cargo:*)",
    "Bash(go:*)",
    "Bash(python:*)",
    "Bash(pip:*)",
    "Bash(pytest:*)",
    "Bash(vitest:*)",
    "Bash(jest:*)",
    "Bash(tsc:*)",
    "Bash(eslint:*)",
    "Bash(prettier:*)",
    "Bash(biome:*)",
    "TodoWrite",
    "WebFetch"
  ]
}
```

### Permission Format

**Tool permissions**:
- `Read` - Read files
- `Write` - Write files
- `Edit` - Edit files
- `Glob` - Search file patterns
- `Grep` - Search file contents
- `TodoWrite` - Write to-do items
- `WebFetch` - Fetch web content

**MCP server permissions**:
- `mcp__daisy` - All Daisy MCP tools
- `mcp__chrome-devtools` - Chrome DevTools MCP

**Bash permissions** (pattern: `Bash(command:pattern)`):
- `Bash(git:*)` - All git commands
- `Bash(npm:*)` - All npm commands
- `Bash(node:script.js)` - Specific command

**Skill permissions**:
- `Skill(frontend-design:frontend-design)` - Frontend design skill

### Adding Permissions

To allow additional commands:

```json
{
  "allow": [
    "Bash(docker:*)",
    "Bash(kubectl:*)",
    "mcp__custom-server"
  ]
}
```

### Permission Hierarchy

1. Explicit allows take precedence
2. MCP tools require `mcp__<server-name>`
3. Bash commands need specific patterns

## MCP Server Configuration

Located at `.mcp.json`:

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

### Adding Additional MCP Servers

```json
{
  "mcpServers": {
    "daisy": {
      "command": "daisy",
      "args": ["mcp"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-chrome-devtools"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-filesystem", "/path/to/dir"]
    }
  }
}
```

### Server Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string | Yes | Command to execute |
| `args` | string[] | No | Command arguments |
| `env` | object | No | Environment variables |

## Base Prompt Template

Located at `.daisy/PROMPT.md`:

```markdown
# Project Overview

Describe your project here. What does it do?
What are the main components?

# Goals

What should be accomplished in this session?
- Goal 1
- Goal 2
- Goal 3

# Guidelines

Coding standards and practices to follow:
- Use TypeScript
- Write tests for new features
- Follow existing patterns

# Technical Notes

Important technical context:
- Database: PostgreSQL
- Frontend: React
- API: REST with Express
- Port: 3000 (frontend), 4000 (API)

# File Structure

Key directories and files:
- /src - Source code
- /tests - Test files
- /docs - Documentation
```

### Prompt Sections

**Project Overview**
- Brief description
- Main components
- Technology stack

**Goals**
- Session objectives
- Priority order
- Success criteria

**Guidelines**
- Coding standards
- Testing requirements
- Documentation expectations
- Commit conventions

**Technical Notes**
- Architecture details
- Environment info
- Dependencies
- Constraints

### Prompt Variables

The base prompt is appended to a dynamic prompt that includes:
- Current iteration number
- Task context (current, completed, pending)
- MCP tool instructions

## Global Configuration

Located at `~/.daisy/projects.json`:

```json
{
  "projects": [
    "/Users/you/project-a",
    "/Users/you/project-b"
  ],
  "current": "/Users/you/project-a"
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `projects` | string[] | Known project paths |
| `current` | string | Currently active project |

### Managing Projects

**Add project**:
```bash
daisy init /path/to/project
# or
daisy use /path/to/project
```

**Switch project**:
```bash
daisy use /path/to/other-project
```

**Remove project** (via UI or API):
```
DELETE /api/projects/:path
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4141` | Server port |
| `HOST` | `127.0.0.1` | Server host |
| `DAISY_PROJECT_PATH` | (none) | Override project path |

### Using Environment Variables

```bash
# Start with custom port
PORT=8080 daisy start

# Override project detection
DAISY_PROJECT_PATH=/my/project daisy mcp
```

## JSON Schemas

Daisy includes JSON schemas for validation in `schemas/`:

### config.schema.json

Validates `.daisy/config.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "loop": {
      "type": "object",
      "properties": {
        "maxIterations": { "type": "integer", "minimum": 1 },
        "maxAttemptsPerTask": { "type": "integer", "minimum": 1 }
      }
    },
    "prompt": {
      "type": "object",
      "properties": {
        "templatePath": { "type": "string" }
      }
    },
    "webhooks": {
      "type": "array",
      "items": { "$ref": "#/definitions/webhook" }
    }
  }
}
```

### tasks.schema.json

Validates `.daisy/tasks.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": { "$ref": "#/definitions/task" },
  "definitions": {
    "task": {
      "type": "object",
      "required": ["id", "title", "status"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-zA-Z0-9_-]+$" },
        "title": { "type": "string", "minLength": 1 },
        "status": { "enum": ["pending", "in_progress", "completed", "skipped", "blocked"] },
        "description": { "type": "string" },
        "dependsOn": { "type": "array", "items": { "type": "string" } },
        "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
        "tasks": { "type": "array", "items": { "$ref": "#/definitions/task" } }
      }
    }
  }
}
```

### state.schema.json

Validates iteration state:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "lastIteration": { "type": "integer", "minimum": 0 },
    "totalTokens": {
      "type": "object",
      "properties": {
        "input": { "type": "integer", "minimum": 0 },
        "output": { "type": "integer", "minimum": 0 }
      }
    },
    "totalCost": { "type": "number", "minimum": 0 }
  }
}
```

## Default Values

### Loop Defaults

```typescript
const DEFAULTS = {
  maxIterations: 10,
  maxAttemptsPerTask: 3
};
```

### Server Defaults

```typescript
const SERVER_DEFAULTS = {
  port: 4141,
  host: "127.0.0.1"
};
```

## Configuration Examples

### Minimal Configuration

```json
// .daisy/config.json
{}
```

Uses all defaults.

### Production Configuration

```json
// .daisy/config.json
{
  "loop": {
    "maxIterations": 50,
    "maxAttemptsPerTask": 5
  },
  "webhooks": [
    {
      "name": "Monitoring",
      "url": "https://monitor.example.com/webhook",
      "events": ["*"],
      "active": true,
      "secret": "secure-random-string"
    }
  ]
}
```

### Development Configuration

```json
// .daisy/config.json
{
  "loop": {
    "maxIterations": 5,
    "maxAttemptsPerTask": 2
  }
}
```

Lower limits for faster iteration during development.

## Related Documentation

- [Getting Started](./getting-started.md) - Initial setup
- [CLI Commands](./cli-commands.md) - Command reference
- [Storage](./storage.md) - File format details
- [Webhooks](./webhooks.md) - Webhook configuration
