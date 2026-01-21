import {
  ArrowDown,
  Camera,
  CheckCircle,
  CircleDot,
  Code,
  FileCode,
  FileEdit,
  FileSearch,
  FileText,
  Globe,
  ListTodo,
  MousePointer,
  Navigation,
  Play,
  Search,
  Settings,
  Terminal,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../hooks/useWebSocket";

interface LogViewerProps {
  logs: LogEntry[];
}

// Tool configuration - maps tool names to colors and icons
interface ToolConfig {
  bg: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOL_CONFIG: Record<string, ToolConfig> = {
  // File operations - blue shades
  Read: { bg: "bg-blue-500/20", text: "text-blue-400", icon: FileText },
  Write: { bg: "bg-blue-600/20", text: "text-blue-300", icon: FileCode },
  Edit: { bg: "bg-blue-400/20", text: "text-blue-300", icon: FileEdit },
  MultiEdit: { bg: "bg-blue-400/20", text: "text-blue-300", icon: FileEdit },

  // Search operations - purple shades
  Glob: { bg: "bg-purple-500/20", text: "text-purple-400", icon: FileSearch },
  Grep: { bg: "bg-purple-600/20", text: "text-purple-300", icon: Search },

  // Execution - orange/amber shades
  Bash: { bg: "bg-orange-500/20", text: "text-orange-400", icon: Terminal },
  Task: { bg: "bg-amber-500/20", text: "text-amber-400", icon: Play },

  // Daisy MCP tools - green shades
  update_task_status: {
    bg: "bg-green-500/20",
    text: "text-green-400",
    icon: CheckCircle,
  },
  signal_iteration_complete: {
    bg: "bg-green-600/20",
    text: "text-green-300",
    icon: CircleDot,
  },
  get_next_task: {
    bg: "bg-green-400/20",
    text: "text-green-300",
    icon: ListTodo,
  },
  list_tasks: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    icon: ListTodo,
  },
  get_stats: { bg: "bg-emerald-400/20", text: "text-emerald-300", icon: Code },
  add_task: { bg: "bg-teal-500/20", text: "text-teal-400", icon: ListTodo },

  // Web operations - cyan shades
  WebFetch: { bg: "bg-cyan-500/20", text: "text-cyan-400", icon: Globe },
  WebSearch: { bg: "bg-cyan-600/20", text: "text-cyan-300", icon: Search },

  // Chrome DevTools - sky shades
  click: { bg: "bg-sky-500/20", text: "text-sky-400", icon: MousePointer },
  hover: { bg: "bg-sky-400/20", text: "text-sky-300", icon: MousePointer },
  fill: { bg: "bg-sky-500/20", text: "text-sky-400", icon: FileEdit },
  navigate_page: { bg: "bg-sky-600/20", text: "text-sky-300", icon: Navigation },
  take_screenshot: { bg: "bg-sky-500/20", text: "text-sky-400", icon: Camera },
  take_snapshot: { bg: "bg-sky-400/20", text: "text-sky-300", icon: Camera },
  evaluate_script: { bg: "bg-sky-600/20", text: "text-sky-400", icon: Code },
  press_key: { bg: "bg-sky-400/20", text: "text-sky-300", icon: Terminal },

  // Utility tools
  KillShell: { bg: "bg-red-500/20", text: "text-red-400", icon: XCircle },

  // Default
  default: { bg: "bg-zinc-500/20", text: "text-zinc-400", icon: Settings },
};

// Parse MCP tool name: mcp__{server}__{tool} -> { server, tool, displayName }
function parseMcpToolName(toolName: string): {
  server: string;
  tool: string;
  displayName: string;
} | null {
  const mcpMatch = toolName.match(/^mcp__([^_]+)__(.+)$/);
  if (mcpMatch) {
    const [, server, tool] = mcpMatch;
    return {
      server,
      tool,
      displayName: `${server}:${tool}`,
    };
  }
  return null;
}

function getToolConfig(toolName: string): ToolConfig {
  // Check for exact match first
  if (TOOL_CONFIG[toolName]) {
    return TOOL_CONFIG[toolName];
  }

  // Check for MCP tools
  const mcpInfo = parseMcpToolName(toolName);
  if (mcpInfo) {
    // Check if we have config for the specific tool
    if (TOOL_CONFIG[mcpInfo.tool]) {
      return TOOL_CONFIG[mcpInfo.tool];
    }

    // Server-specific default colors
    if (mcpInfo.server === "daisy") {
      return { bg: "bg-green-500/20", text: "text-green-400", icon: CircleDot };
    }
    if (
      mcpInfo.server === "chrome-devtools" ||
      mcpInfo.server.includes("browser")
    ) {
      return { bg: "bg-sky-500/20", text: "text-sky-400", icon: Globe };
    }
    if (mcpInfo.server.includes("git") || mcpInfo.server.includes("github")) {
      return { bg: "bg-orange-500/20", text: "text-orange-400", icon: Code };
    }

    // Generic MCP tool
    return { bg: "bg-violet-500/20", text: "text-violet-400", icon: Settings };
  }

  return TOOL_CONFIG.default;
}

// Status badge colors
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
  in_progress: { bg: "bg-blue-500/20", text: "text-blue-400" },
  completed: { bg: "bg-green-500/20", text: "text-green-400" },
  skipped: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  blocked: { bg: "bg-red-500/20", text: "text-red-400" },
};

// Helper to truncate and format file paths
function formatPath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) return path;
  // Show the last part of the path
  const parts = path.split("/");
  let result = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    const newResult = `${parts[i]}/${result}`;
    if (newResult.length > maxLength - 3) {
      return `.../${result}`;
    }
    result = newResult;
  }
  return result;
}

// Helper to truncate strings
function truncate(str: string, maxLength = 40): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

// Get tool-specific parameter display
function getToolParams(
  toolName: string,
  toolInput: Record<string, unknown> | null
): React.ReactNode {
  if (!toolInput) return null;

  const paramClass =
    "text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded";

  switch (toolName) {
    case "Read": {
      const filePath = toolInput.file_path as string | undefined;
      if (filePath) {
        return <span className={paramClass}>{formatPath(filePath)}</span>;
      }
      break;
    }
    case "Write": {
      const filePath = toolInput.file_path as string | undefined;
      if (filePath) {
        return <span className={paramClass}>{formatPath(filePath)}</span>;
      }
      break;
    }
    case "Edit":
    case "MultiEdit": {
      const filePath = toolInput.file_path as string | undefined;
      if (filePath) {
        return <span className={paramClass}>{formatPath(filePath)}</span>;
      }
      break;
    }
    case "Glob": {
      const pattern = toolInput.pattern as string | undefined;
      const path = toolInput.path as string | undefined;
      return (
        <span className="flex items-center gap-1.5">
          {pattern && <span className={paramClass}>{truncate(pattern)}</span>}
          {path && (
            <span className="text-xs text-muted-foreground/60">
              in {formatPath(path, 30)}
            </span>
          )}
        </span>
      );
    }
    case "Grep": {
      const pattern = toolInput.pattern as string | undefined;
      const path = toolInput.path as string | undefined;
      return (
        <span className="flex items-center gap-1.5">
          {pattern && (
            <span className={paramClass}>/{truncate(pattern, 30)}/</span>
          )}
          {path && (
            <span className="text-xs text-muted-foreground/60">
              in {formatPath(path, 30)}
            </span>
          )}
        </span>
      );
    }
    case "Bash": {
      const command = toolInput.command as string | undefined;
      const description = toolInput.description as string | undefined;
      if (description) {
        return (
          <span className="text-xs text-muted-foreground italic">
            {truncate(description, 50)}
          </span>
        );
      }
      if (command) {
        return <span className={paramClass}>{truncate(command, 50)}</span>;
      }
      break;
    }
    case "Task": {
      const description = toolInput.description as string | undefined;
      const subagentType = toolInput.subagent_type as string | undefined;
      return (
        <span className="flex items-center gap-1.5">
          {subagentType && (
            <span className="text-xs text-amber-400/80">[{subagentType}]</span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground">
              {truncate(description, 40)}
            </span>
          )}
        </span>
      );
    }
    case "WebFetch":
    case "WebSearch": {
      const url = toolInput.url as string | undefined;
      const query = toolInput.query as string | undefined;
      if (url) {
        try {
          const urlObj = new URL(url);
          return (
            <span className={paramClass}>{truncate(urlObj.hostname, 30)}</span>
          );
        } catch {
          return <span className={paramClass}>{truncate(url, 40)}</span>;
        }
      }
      if (query) {
        return <span className={paramClass}>"{truncate(query, 30)}"</span>;
      }
      break;
    }

    // Chrome DevTools MCP tools
    case "navigate_page": {
      const url = toolInput.url as string | undefined;
      const type = toolInput.type as string | undefined;
      if (url) {
        try {
          const urlObj = new URL(url);
          return <span className={paramClass}>{urlObj.hostname}</span>;
        } catch {
          return <span className={paramClass}>{truncate(url, 40)}</span>;
        }
      }
      if (type) {
        return (
          <span className="text-xs text-muted-foreground italic">{type}</span>
        );
      }
      break;
    }
    case "click":
    case "hover":
    case "fill": {
      const uid = toolInput.uid as string | undefined;
      const value = toolInput.value as string | undefined;
      return (
        <span className="flex items-center gap-1.5">
          {uid && <span className={paramClass}>#{uid}</span>}
          {value && (
            <span className="text-xs text-muted-foreground">
              "{truncate(value, 20)}"
            </span>
          )}
        </span>
      );
    }
    case "evaluate_script": {
      const fn = toolInput.function as string | undefined;
      if (fn) {
        // Extract just the function signature/start
        const preview = fn.split("\n")[0] || fn;
        return (
          <span className="text-xs text-muted-foreground font-mono">
            {truncate(preview, 40)}
          </span>
        );
      }
      break;
    }
    case "take_screenshot":
    case "take_snapshot": {
      const fullPage = toolInput.fullPage as boolean | undefined;
      const uid = toolInput.uid as string | undefined;
      if (fullPage) {
        return (
          <span className="text-xs text-muted-foreground italic">
            full page
          </span>
        );
      }
      if (uid) {
        return <span className={paramClass}>#{uid}</span>;
      }
      break;
    }
    case "press_key": {
      const key = toolInput.key as string | undefined;
      if (key) {
        return <span className={paramClass}>{key}</span>;
      }
      break;
    }

    // KillShell
    case "KillShell": {
      const shellId = toolInput.shell_id as string | undefined;
      if (shellId) {
        return <span className={paramClass}>#{shellId}</span>;
      }
      break;
    }
  }

  return null;
}

function parseLogText(text: string): React.ReactNode {
  // Check if this is a tool call line (starts with →)
  const toolMatch = text.match(/^→\s+(.+)$/);
  if (toolMatch) {
    let toolPart = toolMatch[1];
    let toolInput: Record<string, unknown> | null = null;

    // Check if there's tool input (format: toolName|jsonInput)
    const pipeIndex = toolPart.indexOf("|");
    if (pipeIndex !== -1) {
      const jsonPart = toolPart.slice(pipeIndex + 1);
      toolPart = toolPart.slice(0, pipeIndex);
      try {
        toolInput = JSON.parse(jsonPart);
      } catch {
        // Ignore parse errors
      }
    }

    const toolName = toolPart;
    const config = getToolConfig(toolName);
    const Icon = config.icon;

    // Format display name - parse MCP tools
    let displayName = toolName;
    const mcpInfo = parseMcpToolName(toolName);
    if (mcpInfo) {
      displayName = mcpInfo.displayName;
    }

    // Get tool-specific parameters
    let extraInfo: React.ReactNode = null;

    // Handle daisy tools specially
    if (toolInput && mcpInfo?.server === "daisy") {
      const toolAction = mcpInfo.tool;

      if (
        toolAction === "update_task_status" &&
        toolInput.taskId &&
        toolInput.status
      ) {
        const statusColors =
          STATUS_COLORS[toolInput.status as string] || STATUS_COLORS.pending;
        extraInfo = (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-mono">
              {toolInput.taskId as string}
            </span>
            <span className="text-muted-foreground">→</span>
            <span
              className={`px-1.5 py-0.5 rounded ${statusColors.bg} ${statusColors.text}`}
            >
              {(toolInput.status as string).replace("_", " ")}
            </span>
          </span>
        );
      } else if (toolAction === "signal_iteration_complete") {
        const reason = toolInput.reason as string | undefined;
        const completeLoop = toolInput.completeLoop as boolean | undefined;
        extraInfo = (
          <span className="text-xs text-muted-foreground">
            {completeLoop ? "(ending loop)" : reason ? `(${reason})` : ""}
          </span>
        );
      }
    } else {
      // Get params for all other tools (including other MCP tools)
      extraInfo = getToolParams(mcpInfo?.tool || toolName, toolInput);
    }

    return (
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground">→</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${config.bg} ${config.text}`}
        >
          <Icon className="h-3 w-3" />
          {displayName}
        </span>
        {extraInfo}
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
