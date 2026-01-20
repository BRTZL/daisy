# Web UI

Daisy includes a modern React-based web interface for monitoring and managing autonomous development loops. The UI provides real-time updates, task management, interactive planning, and session history.

## Overview

The web UI is:
- Built with React 19 and TypeScript
- Styled with Tailwind CSS
- Uses React Query for server state
- Real-time updates via WebSocket
- Drag-and-drop with @dnd-kit
- Accessible components via Radix UI

## Accessing the UI

### Via Daemon

```bash
# Start daemon (if not running)
daisy start

# Open UI in browser
daisy open
```

URL: `http://daisy.test:4141`

### Development Mode

```bash
# Terminal 1: Start server
npm run dev:server

# Terminal 2: Start web dev server
cd src/web
npm run dev
```

URL: `http://localhost:5173`

## Views

The UI has four main views, accessible via tabs in the header.

### Dashboard View

The default view showing real-time loop status.

```
┌──────────────────────────────────────────────────────────────┐
│  Header: Project Selector │ Dashboard │ Board │ Planning │   │
├──────────────────────────────────────────────────────────────┤
│  Stats Bar: Progress │ In Progress │ Iteration │ Tokens     │
├────────────────────────┬─────────────────────────────────────┤
│                        │                                     │
│     Task Tree          │          Log Viewer                │
│                        │                                     │
│  - setup (✓)           │  10:30:45 Working on auth-login... │
│    - setup-db (✓)      │  10:30:46 Reading existing code... │
│    - setup-config (✓)  │  10:30:50 Implementing endpoint... │
│  - auth (○)            │  10:31:00 Running tests...         │
│    - auth-login (●)    │  10:31:05 Tests passed!            │
│    - auth-logout (○)   │                                     │
│                        ├─────────────────────────────────────┤
│  [+] Add Task          │          Controls                   │
│                        │                                     │
│                        │  [Start Loop]  Max: 10  ☑ Use tasks │
│                        │                                     │
└────────────────────────┴─────────────────────────────────────┘
```

**Components**:

- **Task Tree**: Hierarchical task view with expand/collapse
  - Status icons: ✓ completed, ● in_progress, ○ pending, ✗ skipped, ⚠ blocked
  - Hover actions: Add subtask, Edit, Delete
  - Click to expand/collapse subtasks

- **Log Viewer**: Real-time streaming logs
  - Auto-scroll follows new logs
  - Search/filter functionality
  - Color-coded levels (info, warning, error, success)
  - Shows timestamps

- **Controls**: Loop management
  - Start/Stop button
  - Max iterations input
  - "Use tasks" checkbox
  - Settings dropdown

### Board View

Kanban-style task board with drag-and-drop.

```
┌──────────────────────────────────────────────────────────────┐
│  Pending    │ In Progress │  Blocked   │ Completed │ Skipped │
├─────────────┼─────────────┼────────────┼───────────┼─────────┤
│ ┌─────────┐ │ ┌─────────┐ │            │ ┌───────┐ │         │
│ │auth-    │ │ │auth-    │ │            │ │setup  │ │         │
│ │logout   │ │ │login    │ │            │ │       │ │         │
│ └─────────┘ │ └─────────┘ │            │ └───────┘ │         │
│             │             │            │ ┌───────┐ │         │
│             │             │            │ │setup- │ │         │
│             │             │            │ │db     │ │         │
│             │             │            │ └───────┘ │         │
└─────────────┴─────────────┴────────────┴───────────┴─────────┘
```

**Features**:

- **Columns**: Pending, In Progress, Blocked, Completed, Skipped
- **Drag-and-drop**: Move cards between columns to change status
- **Card details**: Click card to open detail modal
- **Visual feedback**: Color-coded borders and backgrounds

**Card Information**:
- Task title and description preview
- Subtask count badge
- Dependency count badge
- Attempt count indicator
- Task ID

**Detail Modal**:
- Edit title and description
- Change status via buttons
- View dependencies and acceptance criteria
- View completion summary or skip reason
- Delete task

### Planning View

Interactive AI planning chat interface.

```
┌──────────────────────────────────────────────────────────────┐
│  Planning Assistant                          [Start Session] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     User                                     │
│  ┌────────────────────────────────────────────┐             │
│  │ I need to implement user authentication    │  10:30      │
│  │ with JWT tokens and refresh token support  │             │
│  └────────────────────────────────────────────┘             │
│                                                              │
│  Assistant                                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │ I'll help you plan the authentication feature.     │     │
│  │ Here's what I suggest:                             │     │
│  │                                                    │     │
│  │ 1. Set up JWT infrastructure                       │     │
│  │ 2. Create login endpoint                           │     │
│  │ 3. Implement refresh token logic                   │     │
│  │                                                    │     │
│  │ Added tasks: auth-jwt, auth-login, auth-refresh    │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [Type your message...                               ] [Send] │
└──────────────────────────────────────────────────────────────┘
```

**Features**:

- **Start/End session**: Manage planning session lifecycle
- **Chat interface**: User messages right-aligned, assistant left-aligned
- **Task tracking**: Shows added/updated/removed tasks per message
- **Keyboard shortcut**: Cmd+Enter to send
- **Message history**: Preserved during session

### History View

Past session analytics and details.

```
┌──────────────────────────────────────────────────────────────┐
│  Session History                                             │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ● Jan 15, 2024 10:00 AM            Completed  │ $2.45  │ │
│  │   15 iterations • 1h 30m                               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ○ Jan 14, 2024 2:30 PM              Stopped   │ $0.85  │ │
│  │   5 iterations • 25m                                   │ │
│  │   ─────────────────────────────────────────────────── │ │
│  │   Mode: task-based                                     │ │
│  │   Tokens: 50,000 in / 15,000 out                      │ │
│  │   Completed: setup, setup-db, auth-login               │ │
│  │   Session ID: session-h1z2y3-abc123                    │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ✗ Jan 13, 2024 9:00 AM                Error   │ $0.15  │ │
│  │   2 iterations • 10m                                   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Features**:

- **Expandable sessions**: Click to view details
- **Status indicators**: Completed (green), Running (blue), Stopped (yellow), Error (red)
- **Session details**: Mode, token counts, cost, completed tasks
- **Duration**: Calculated from start/end times

## Components

### StatsBar

Displays real-time metrics across the top of the main content.

**Metrics shown**:
- Task completion progress bar
- In-progress task count (with pulse animation)
- Current iteration number
- Token usage (input/output)
- Running cost

### TaskTree

Hierarchical task view in dashboard sidebar.

**Features**:
- Recursive rendering for nested tasks
- Expand/collapse state management
- Inline CRUD actions on hover
- Task creation/edit dialog
- Auto-refresh every 5 seconds

### LogViewer

Streaming log display with filtering.

**Features**:
- Auto-scroll follows new entries
- Manual scroll disables auto-scroll
- Search/filter toggle
- Color-coded log levels
- Line limit (500 entries)
- "Scroll to bottom" button

### Controls

Loop execution controls.

**Features**:
- Start/Stop toggle button
- Max iterations input
- "Use tasks" mode checkbox
- Settings panel with options
- Status display when running

### ProjectSelector

Project switcher dropdown.

**Features**:
- Lists all known projects
- Current project highlighted
- Remove project option
- Instructions for adding projects

### KanbanBoard

Drag-and-drop task board.

**Features**:
- Custom collision detection (columns prioritized)
- Smooth drag animations
- Task detail modal on click
- Status change on column drop
- Visual drag overlay

### KanbanCard

Individual task card.

**Features**:
- Status indicator with color
- Title and description preview
- Metadata badges (subtasks, deps, attempts)
- Drag handle on hover

### KanbanColumn

Droppable task column.

**Features**:
- Status-specific styling
- Drop zone visual feedback
- Task count badge
- Empty state message

### PlanningChat

AI planning chat interface.

**Features**:
- Session management (start/end)
- Message history display
- Task change tracking
- Optimistic message updates
- Keyboard shortcuts

### SessionHistory

Past session display.

**Features**:
- Expandable detail view
- Status color coding
- Duration calculation
- Task completion list

## State Management

### React Query

Server state is managed with React Query:

```typescript
// Queries
const { data: tasks } = useQuery({
  queryKey: ["tasks"],
  queryFn: api.getTasks,
  refetchInterval: 5000
});

const { data: project } = useQuery({
  queryKey: ["project"],
  queryFn: api.getCurrentProject
});

// Mutations
const createMutation = useMutation({
  mutationFn: api.createTask,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }
});
```

### WebSocket Hook

Real-time updates via custom hook:

```typescript
const { logs, loopStatus, stats, isConnected, clearLogs } = useWebSocket();
```

**WebSocket messages**:
- `log`: New log entry
- `task-updated`: Trigger task refetch
- `iteration-start`: Loop iteration started
- `iteration-complete`: Iteration finished
- `loop-complete`: Loop finished
- `loop-status`: Full status update
- `stats`: Task statistics update
- `error`: Error notification

## API Client

REST API client for server communication:

```typescript
// Projects
api.getProjects()
api.getCurrentProject()
api.switchProject(path)
api.removeProject(path)

// Tasks
api.getTasks()
api.createTask(task)
api.updateTask(id, updates)
api.deleteTask(id)

// Loop
api.getLoopStatus()
api.startLoop(options)
api.stopLoop()

// History
api.getHistory()

// Planning
api.getPlanningStatus()
api.startPlanningSession()
api.endPlanningSession()
api.sendPlanningMessage(message)
```

## Styling

### Tailwind Configuration

```typescript
// tailwind.config.ts
export default {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: "hsl(var(--primary))",
        secondary: "hsl(var(--secondary))",
        destructive: "hsl(var(--destructive))",
        muted: "hsl(var(--muted))",
        accent: "hsl(var(--accent))",
        card: "hsl(var(--card))",
        popover: "hsl(var(--popover))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
}
```

### CSS Variables

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --secondary: 210 40% 96.1%;
  --muted: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode values */
}
```

### Log Level Colors

```css
.log-line-info { color: inherit; }
.log-line-warning { color: rgb(234 179 8); }
.log-line-error { color: rgb(239 68 68); }
.log-line-success { color: rgb(34 197 94); }
```

## Build Configuration

### Vite Config

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../../dist/web"
  },
  server: {
    proxy: {
      "/api": "http://localhost:4141",
      "/ws": {
        target: "ws://localhost:4141",
        ws: true
      }
    }
  }
});
```

### Production Build

```bash
cd src/web
npm run build
```

Output: `dist/web/` (served by Hono static middleware)

## UI Components (shadcn/ui)

Reusable components based on Radix UI primitives:

- **Button**: Multiple variants (default, ghost, outline, destructive)
- **Input**: Text input with focus ring
- **Textarea**: Multi-line input
- **Dialog**: Modal with header/body/footer
- **DropdownMenu**: Menu with trigger and items
- **Checkbox**: Controlled checkbox input
- **Label**: Form labels

## Browser Notifications

The UI requests notification permission and shows alerts for:
- Loop completion
- Errors

```typescript
if (Notification.permission === "granted") {
  new Notification("Daisy", {
    body: "Loop completed successfully!"
  });
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Send planning message |

## Related Documentation

- [Getting Started](./getting-started.md) - UI basics
- [Architecture](./architecture.md) - System design
- [Daemon](./daemon.md) - Running the server
