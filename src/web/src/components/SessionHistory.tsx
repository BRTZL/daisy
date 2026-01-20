import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Hash,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { api, type Session } from "../lib/api";

interface SessionHistoryProps {
  projectPath: string | null;
}

export function SessionHistory({ projectPath }: SessionHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: api.getHistory,
    enabled: !!projectPath,
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return "In progress";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return "<$0.01";
    return `$${cost.toFixed(2)}`;
  };

  const getStatusIcon = (status: Session["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "stopped":
        return <XCircle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: Session["status"]) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "running":
        return "Running";
      case "stopped":
        return "Stopped";
      case "error":
        return "Error";
      default:
        return status;
    }
  };

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Select a project first</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            No Sessions Yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Run some loops to see your session history here. Each session tracks
            iterations, token usage, and completed tasks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="space-y-3">
        {sessions.map((session) => {
          const isExpanded = expandedIds.has(session.id);

          return (
            <div
              key={session.id}
              className="border border-border rounded-lg overflow-hidden"
            >
              {/* Session header */}
              <button
                onClick={() => toggleExpand(session.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}

                {/* Status */}
                {getStatusIcon(session.status)}

                {/* Date/Time */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDate(session.startedAt)}
                    <span className="text-muted-foreground">
                      {formatTime(session.startedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {session.iterations} iterations
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(session.startedAt, session.completedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Coins className="h-3 w-3" />
                      {formatCost(session.usage.costUsd)}
                    </span>
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    session.status === "completed"
                      ? "bg-green-500/10 text-green-500"
                      : session.status === "running"
                        ? "bg-blue-500/10 text-blue-500"
                        : session.status === "stopped"
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {getStatusLabel(session.status)}
                </span>
              </button>

              {/* Session details */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                  {/* Stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Mode
                      </div>
                      <div className="text-sm font-medium capitalize">
                        {session.mode.replace("-", " ")}
                      </div>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Input Tokens
                      </div>
                      <div className="text-sm font-medium">
                        {session.usage.inputTokens.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Output Tokens
                      </div>
                      <div className="text-sm font-medium">
                        {session.usage.outputTokens.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-background rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">
                        Total Cost
                      </div>
                      <div className="text-sm font-medium">
                        {formatCost(session.usage.costUsd)}
                      </div>
                    </div>
                  </div>

                  {/* Completed tasks */}
                  {session.tasksCompleted.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-2">
                        Completed Tasks ({session.tasksCompleted.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {session.tasksCompleted.map((taskId) => (
                          <span
                            key={taskId}
                            className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded"
                          >
                            {taskId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Session ID */}
                  <div className="text-xs text-muted-foreground/50">
                    Session ID: {session.id}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
