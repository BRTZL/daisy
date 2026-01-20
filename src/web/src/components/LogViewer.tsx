import { ArrowDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../hooks/useWebSocket";

interface LogViewerProps {
  logs: LogEntry[];
}

// Tool badge colors - maps tool names to Tailwind classes
const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
  // File operations - blue shades
  Read: { bg: "bg-blue-500/20", text: "text-blue-400" },
  Write: { bg: "bg-blue-600/20", text: "text-blue-300" },
  Edit: { bg: "bg-blue-400/20", text: "text-blue-300" },
  MultiEdit: { bg: "bg-blue-400/20", text: "text-blue-300" },

  // Search operations - purple shades
  Glob: { bg: "bg-purple-500/20", text: "text-purple-400" },
  Grep: { bg: "bg-purple-600/20", text: "text-purple-300" },

  // Execution - orange/amber shades
  Bash: { bg: "bg-orange-500/20", text: "text-orange-400" },
  Task: { bg: "bg-amber-500/20", text: "text-amber-400" },

  // Daisy MCP tools - green shades
  update_task_status: { bg: "bg-green-500/20", text: "text-green-400" },
  signal_iteration_complete: { bg: "bg-green-600/20", text: "text-green-300" },
  get_next_task: { bg: "bg-green-400/20", text: "text-green-300" },
  list_tasks: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
  get_stats: { bg: "bg-emerald-400/20", text: "text-emerald-300" },
  add_task: { bg: "bg-teal-500/20", text: "text-teal-400" },

  // Web operations - cyan shades
  WebFetch: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
  WebSearch: { bg: "bg-cyan-600/20", text: "text-cyan-300" },

  // Default
  default: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
};

function getToolColor(toolName: string): { bg: string; text: string } {
  // Check for exact match first
  if (TOOL_COLORS[toolName]) {
    return TOOL_COLORS[toolName];
  }

  // Check for mcp__daisy__ prefix
  if (toolName.startsWith("mcp__daisy__")) {
    const daisyTool = toolName.replace("mcp__daisy__", "");
    if (TOOL_COLORS[daisyTool]) {
      return TOOL_COLORS[daisyTool];
    }
    // Default daisy tool color
    return { bg: "bg-green-500/20", text: "text-green-400" };
  }

  return TOOL_COLORS.default;
}

function parseLogText(text: string): React.ReactNode {
  // Check if this is a tool call line (starts with →)
  const toolMatch = text.match(/^→\s+(.+)$/);
  if (toolMatch) {
    const toolName = toolMatch[1];
    const colors = getToolColor(toolName);

    // Format display name
    let displayName = toolName;
    if (toolName.startsWith("mcp__daisy__")) {
      displayName = toolName.replace("mcp__daisy__", "daisy:");
    }

    return (
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground">→</span>
        <span
          className={`px-2 py-0.5 rounded-md text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          {displayName}
        </span>
      </span>
    );
  }

  return text;
}

export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const filteredLogs = filter
    ? logs.filter((log) =>
        log.text.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  const getLevelClass = (level: LogEntry["level"]) => {
    switch (level) {
      case "error":
        return "log-line-error";
      case "warning":
        return "log-line-warning";
      case "success":
        return "log-line-success";
      case "info":
        return "log-line-info";
      default:
        return "";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`p-1.5 rounded-md transition-colors ${
            showSearch
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title="Search logs (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </button>

        {showSearch && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="flex-1 bg-muted px-2 py-1 text-sm rounded-md border-none outline-none focus:ring-1 focus:ring-ring"
          />
        )}

        <div className="flex-1" />

        <span className="text-xs text-muted-foreground">
          {filteredLogs.length} {filteredLogs.length === 1 ? "line" : "lines"}
        </span>

        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) {
                containerRef.current.scrollTop =
                  containerRef.current.scrollHeight;
              }
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 font-mono text-sm"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            {logs.length === 0
              ? "No logs yet. Start a loop to see output."
              : "No logs match your filter."}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`log-line flex gap-3 ${getLevelClass(log.level)}`}
              >
                <span className="text-muted-foreground shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className="whitespace-pre-wrap break-all">
                  {parseLogText(log.text)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
