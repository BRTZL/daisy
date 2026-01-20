# CLI Commands Reference

This document provides complete documentation for all Daisy CLI commands.

## Overview

Daisy CLI is built with Commander.js and provides commands for project initialization, daemon management, and project switching.

```bash
daisy [command] [options]
```

## Global Options

| Option | Description |
|--------|-------------|
| `-V, --version` | Display version number |
| `-h, --help` | Display help for command |

---

## Commands

### `daisy init`

Initialize a new Daisy project with all necessary configuration files.

#### Usage

```bash
daisy init [path] [options]
```

#### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `path` | No | `.` (current directory) | Project directory path |

#### Options

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Custom project name (defaults to directory basename) |
| `-p, --prompt <path>` | Path to custom PROMPT.md file |

#### What It Creates

```
project/
├── .daisy/
│   ├── config.json      # Loop settings, webhooks
│   ├── tasks.json       # Empty task array
│   ├── PROMPT.md        # Base prompt template
│   └── plans/           # Planning session directory
├── .claude/
│   └── settings.json    # Claude Code permissions
└── .mcp.json            # MCP server configuration
```

#### Files Detail

**`.daisy/config.json`**
```json
{
  "loop": {
    "maxIterations": 10,
    "maxAttemptsPerTask": 3
  }
}
```

**`.daisy/tasks.json`**
```json
[]
```

**`.daisy/PROMPT.md`**
```markdown
# Project Overview

[Describe your project here]

# Goals

[What should be accomplished]

# Guidelines

[Coding standards and practices]

# Technical Notes

[Technical context and constraints]
```

**`.claude/settings.json`**
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
    "Bash(node:*)",
    "TodoWrite",
    "WebFetch"
  ]
}
```

**`.mcp.json`**
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

#### Re-initialization Behavior

If `.daisy` directory already exists, the command prompts for each file:
- **Keep**: Don't modify existing file
- **Overwrite**: Replace with default content
- **Merge** (for .mcp.json only): Add daisy server while keeping other servers

#### Legacy Task Import

If a `tasks.json` file exists in the project root with the old format (sections/items), it will be automatically migrated to the new recursive task format.

**Old format:**
```json
{
  "sections": [
    {
      "id": 1,
      "name": "Setup",
      "items": [
        { "text": "Create database", "status": "passed" }
      ]
    }
  ]
}
```

**Converted to:**
```json
[
  {
    "id": "Setup-1",
    "title": "Create database",
    "status": "completed"
  }
]
```

#### Examples

```bash
# Initialize current directory
daisy init

# Initialize a new directory
daisy init my-project

# Initialize with custom name
daisy init ./backend --name "API Server"

# Use a custom prompt file
daisy init --prompt ~/templates/my-prompt.md
```

---

### `daisy install`

Install the Daisy daemon (macOS only) and configure `/etc/hosts` for the `daisy.test` domain.

#### Usage

```bash
daisy install [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--no-browser` | Don't open browser after installation |
| `--port <port>` | Port to run daemon on (default: 4141) |

#### What It Does

1. **Locates Server Binary**: Finds the `daisy` server entry point
2. **Configures /etc/hosts**: Adds `127.0.0.1  daisy.test` entry (requires sudo)
3. **Installs launchd Plist**: Creates `~/Library/LaunchAgents/com.daisy.daemon.plist`
4. **Starts Daemon**: Loads the plist with launchctl
5. **Opens Browser**: Navigates to `http://daisy.test:4141`

#### launchd Plist Configuration

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.daisy.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/node</string>
        <string>/path/to/server/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>~/Library/Logs/daisy/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>~/Library/Logs/daisy/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>4141</string>
        <key>HOST</key>
        <string>127.0.0.1</string>
    </dict>
</dict>
</plist>
```

#### Examples

```bash
# Standard installation
daisy install

# Install without opening browser
daisy install --no-browser

# Install on custom port
daisy install --port 8080
```

---

### `daisy start`

Start the Daisy daemon (if installed).

#### Usage

```bash
daisy start [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--no-browser` | Don't open browser after starting |

#### Requirements

- Daemon must be installed (`daisy install`)
- macOS only (uses launchctl)

#### Examples

```bash
# Start daemon
daisy start

# Start without opening browser
daisy start --no-browser
```

---

### `daisy stop`

Stop the running Daisy daemon.

#### Usage

```bash
daisy stop
```

#### What It Does

Unloads the launchd plist, stopping the daemon process.

---

### `daisy open`

Open the Daisy web UI in your default browser.

#### Usage

```bash
daisy open
```

#### Requirements

- Daemon must be running

#### Opens

`http://daisy.test:4141` (or the configured port)

---

### `daisy use`

Switch to a different Daisy project.

#### Usage

```bash
daisy use <path>
```

#### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `path` | Yes | Path to project directory |

#### What It Does

1. **Validates Path**: Ensures directory exists and contains `.daisy/config.json`
2. **Registers Project**: Adds to known projects list
3. **Sets Current**: Makes this the active project
4. **Notifies Daemon**: If running, tells server to switch context

#### Examples

```bash
# Switch to project by path
daisy use ~/projects/my-app

# Relative path
daisy use ../other-project
```

---

### `daisy uninstall`

Remove the Daisy daemon and `/etc/hosts` entry.

#### Usage

```bash
daisy uninstall [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip confirmation prompt |
| `--keep-logs` | Preserve log files |

#### What It Removes

1. **Daemon**: Stops and removes launchd plist
2. **/etc/hosts Entry**: Removes `daisy.test` line (requires sudo)
3. **Log Files**: Removes `~/Library/Logs/daisy/` (unless `--keep-logs`)

#### Examples

```bash
# Uninstall with confirmation
daisy uninstall

# Uninstall without confirmation
daisy uninstall -y

# Keep logs when uninstalling
daisy uninstall --keep-logs
```

---

### `daisy mcp`

Start the MCP (Model Context Protocol) server for Claude Code integration.

#### Usage

```bash
daisy mcp
```

#### What It Does

Starts an MCP server in stdio mode. This command is typically invoked by Claude Code, not directly by users.

#### Configuration

The MCP server is configured in `.mcp.json`:

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

#### Available Tools

When running, the MCP server exposes these tools to Claude:

| Tool | Description |
|------|-------------|
| `get_current_project` | Get project info and stats |
| `list_tasks` | List and filter tasks |
| `get_next_task` | Get next pending task |
| `update_task_status` | Change task status |
| `get_stats` | Get task statistics |
| `signal_iteration_complete` | Signal iteration done |
| `add_task` | Create a new task |
| `update_plan_task` | Update task properties |
| `remove_task` | Delete a task |
| `list_plan_tasks` | List tasks with formatting |
| `finalize_plan` | Validate and finalize plan |

See [MCP Server](./mcp-server.md) for detailed tool documentation.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid arguments, missing files, etc.) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DAISY_PROJECT_PATH` | Override project path detection |
| `PORT` | Server port (default: 4141) |
| `HOST` | Server host (default: 127.0.0.1) |

## File Locations

### Project Files

```
project/
├── .daisy/
│   ├── config.json
│   ├── tasks.json
│   ├── PROMPT.md
│   ├── history.json
│   ├── plans/
│   ├── .signal
│   └── .temp/
├── .claude/
│   └── settings.json
└── .mcp.json
```

### Global Files

```
~/.daisy/
└── projects.json       # Known projects list

~/Library/LaunchAgents/
└── com.daisy.daemon.plist

~/Library/Logs/daisy/
├── stdout.log
└── stderr.log
```

## Error Messages

### Common Errors

**"Not a daisy project"**
- Run `daisy init` in your project directory

**"Daemon not installed"**
- Run `daisy install` to set up the daemon

**"Daemon not running"**
- Run `daisy start` to start the daemon

**"Directory does not exist"**
- Check the path you provided to `init` or `use`

**"Permission denied"**
- `/etc/hosts` modification requires sudo access

## Shell Completions

Daisy supports shell completions for bash, zsh, and fish:

```bash
# Bash
daisy completions bash >> ~/.bashrc

# Zsh
daisy completions zsh >> ~/.zshrc

# Fish
daisy completions fish > ~/.config/fish/completions/daisy.fish
```

## Related Documentation

- [Getting Started](./getting-started.md) - First-time setup guide
- [MCP Server](./mcp-server.md) - MCP tool details
- [Configuration](./configuration.md) - Config file options
- [Daemon](./daemon.md) - Daemon internals
