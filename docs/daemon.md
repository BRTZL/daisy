# Daemon

The Daisy daemon is a background service that runs the HTTP server, enabling the web UI and providing continuous project management. It uses macOS launchd for lifecycle management.

## Overview

The daemon:
- Runs as a launchd service on macOS
- Starts automatically on login
- Restarts automatically on crash
- Serves the web UI and API
- Manages loop execution

## Installation

### Install Daemon

```bash
daisy install
```

This command:
1. Locates the Daisy server binary
2. Configures `/etc/hosts` for `daisy.test` domain
3. Creates launchd plist file
4. Starts the daemon
5. Opens the web UI in browser

### Options

| Option | Description |
|--------|-------------|
| `--no-browser` | Don't open browser after installation |
| `--port <port>` | Custom port (default: 4141) |

### Example

```bash
daisy install --port 8080 --no-browser
```

## Uninstallation

### Remove Daemon

```bash
daisy uninstall
```

This command:
1. Stops the daemon
2. Removes the launchd plist
3. Removes `/etc/hosts` entry
4. Removes log files (unless `--keep-logs`)

### Options

| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip confirmation prompt |
| `--keep-logs` | Preserve log files |

## Lifecycle Commands

### Start Daemon

```bash
daisy start
```

Loads the launchd plist to start the daemon.

### Stop Daemon

```bash
daisy stop
```

Unloads the launchd plist to stop the daemon.

### Open UI

```bash
daisy open
```

Opens `http://daisy.test:4141` in the default browser.

## launchd Configuration

### Plist Location

```
~/Library/LaunchAgents/com.daisy.daemon.plist
```

### Plist Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.daisy.daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/dist/server/index.js</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/you/Library/Logs/daisy/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/you/Library/Logs/daisy/stderr.log</string>

    <key>WorkingDirectory</key>
    <string>/Users/you</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>4141</string>
        <key>HOST</key>
        <string>127.0.0.1</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

### Key Properties

| Property | Value | Description |
|----------|-------|-------------|
| `Label` | `com.daisy.daemon` | Unique identifier |
| `RunAtLoad` | `true` | Start on login |
| `KeepAlive` | `true` | Restart on crash |
| `PORT` | `4141` | Server port |
| `HOST` | `127.0.0.1` | Server host |

## Server Binary Discovery

The daemon needs to find the server entry point. It searches in this order:

### 1. Development Mode

```
./dist/server/index.js
```

If running from the Daisy source directory.

### 2. npm Link

```
<package.json location>/dist/server/index.js
```

For development with `npm link`.

### 3. Global npm Install

```
npm root -g/daisy/dist/server/index.js
```

Standard global installation.

### 4. Fallback

```
which daisy → realpath → ../dist/server/index.js
```

Follow symlinks to find the real location.

## /etc/hosts Configuration

### Entry Added

```
127.0.0.1  daisy.test  # Added by Daisy
```

### Why daisy.test?

- Provides a memorable local URL
- `.test` TLD is reserved for testing
- No conflicts with real domains
- Works without localhost port numbers in URL

### Adding Entry

```bash
# Attempts direct write first
echo "127.0.0.1  daisy.test  # Added by Daisy" >> /etc/hosts

# Falls back to sudo if needed
echo "127.0.0.1  daisy.test  # Added by Daisy" | sudo tee -a /etc/hosts
```

### Removing Entry

Uses pattern matching to remove the line:

```bash
sudo sed -i '' '/daisy.test.*# Added by Daisy/d' /etc/hosts
```

## Log Files

### Location

```
~/Library/Logs/daisy/
├── stdout.log
└── stderr.log
```

### Viewing Logs

```bash
# Tail stdout
tail -f ~/Library/Logs/daisy/stdout.log

# Tail stderr
tail -f ~/Library/Logs/daisy/stderr.log

# View recent errors
cat ~/Library/Logs/daisy/stderr.log
```

### Log Rotation

Logs are not automatically rotated. They grow indefinitely. To clear:

```bash
# Clear logs manually
> ~/Library/Logs/daisy/stdout.log
> ~/Library/Logs/daisy/stderr.log

# Or remove directory
rm -rf ~/Library/Logs/daisy
```

## HTTP Server

### Overview

The daemon runs a Hono-based HTTP server:

- **Port**: 4141 (configurable)
- **Host**: 127.0.0.1 (localhost only)
- **CORS**: Enabled for localhost:5173 and daisy.test

### Endpoints

```
GET  /api/projects          # List projects
GET  /api/projects/current  # Get current project
POST /api/projects/use      # Switch project
DELETE /api/projects/:path  # Remove project

GET  /api/tasks             # List tasks
POST /api/tasks             # Create task
PUT  /api/tasks/:id         # Update task
DELETE /api/tasks/:id       # Delete task

GET  /api/stats             # Get statistics
GET  /api/loop/status       # Get loop status
POST /api/loop/start        # Start loop
POST /api/loop/stop         # Stop loop

GET  /api/history           # Get session history

POST /api/planning/start    # Start planning
POST /api/planning/end      # End planning
POST /api/planning/message  # Send message
GET  /api/planning/status   # Get status
```

### Static Files

The server serves the web UI from `dist/web/`:

```
GET /                 → dist/web/index.html
GET /assets/*        → dist/web/assets/*
GET /any/path        → dist/web/index.html (SPA fallback)
```

### WebSocket

WebSocket endpoint for real-time updates:

```
ws://daisy.test:4141/ws
```

Messages:
- `loop-status`: Loop state updates
- `stats`: Task statistics
- `log`: Streaming logs
- `iteration-start`: Iteration began
- `iteration-complete`: Iteration ended
- `task-updated`: Task changed
- `loop-complete`: Loop finished
- `error`: Error occurred

## Troubleshooting

### Daemon Won't Start

**Check if installed:**
```bash
ls ~/Library/LaunchAgents/com.daisy.daemon.plist
```

**Check launchctl status:**
```bash
launchctl list | grep daisy
```

**Check logs for errors:**
```bash
cat ~/Library/Logs/daisy/stderr.log
```

**Reinstall:**
```bash
daisy uninstall
daisy install
```

### Port Already in Use

**Find process using port:**
```bash
lsof -i :4141
```

**Use different port:**
```bash
daisy uninstall
daisy install --port 8080
```

### Cannot Access daisy.test

**Check /etc/hosts:**
```bash
cat /etc/hosts | grep daisy
```

**Flush DNS cache:**
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

**Use localhost directly:**
```
http://127.0.0.1:4141
```

### Node Not Found

**Check node path:**
```bash
which node
```

**Reinstall with correct path:**
```bash
daisy uninstall
# Ensure node is in PATH
daisy install
```

### Permission Denied for /etc/hosts

**Run with sudo when prompted:**
The install command will request sudo access.

**Manual fix:**
```bash
sudo nano /etc/hosts
# Add: 127.0.0.1  daisy.test  # Added by Daisy
```

## Manual Operations

### Manual Start

```bash
# Via launchctl
launchctl load ~/Library/LaunchAgents/com.daisy.daemon.plist

# Or directly
node /path/to/dist/server/index.js
```

### Manual Stop

```bash
# Via launchctl
launchctl unload ~/Library/LaunchAgents/com.daisy.daemon.plist

# Or kill process
pkill -f "daisy.*server"
```

### Check Status

```bash
# Via launchctl
launchctl list com.daisy.daemon

# Output includes:
# PID if running
# Exit status if not
```

### View Daemon Info

```bash
# Full plist content
plutil -p ~/Library/LaunchAgents/com.daisy.daemon.plist

# Check if running
launchctl print gui/$(id -u)/com.daisy.daemon
```

## Environment Variables

The daemon recognizes these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4141` | Server port |
| `HOST` | `127.0.0.1` | Server host |
| `DAISY_PROJECT_PATH` | (none) | Override project detection |

## Security Considerations

### Local Only

- Server binds to `127.0.0.1` (localhost)
- Not accessible from network
- No authentication required (local trust)

### Sudo Requirements

- `/etc/hosts` modification requires sudo
- User is prompted for password
- No sudo for daemon management

### File Permissions

- Plist: User read/write
- Logs: User read/write
- No elevated privileges for daemon

## Platform Support

Currently, the daemon only supports **macOS** with launchd.

### Not Supported

- **Linux**: Would need systemd integration
- **Windows**: Would need Windows Service integration

### Workaround for Other Platforms

Run the server manually:

```bash
# Start server
node dist/server/index.js

# Or with npm script
npm run start:server
```

## Related Documentation

- [Getting Started](./getting-started.md) - Installation basics
- [CLI Commands](./cli-commands.md) - Command reference
- [Architecture](./architecture.md) - System design
- [Web UI](./web-ui.md) - UI documentation
