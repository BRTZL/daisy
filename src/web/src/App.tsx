import { useQuery } from "@tanstack/react-query";
import { Kanban, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Controls } from "./components/Controls";
import { KanbanBoard } from "./components/kanban";
import { LogViewer } from "./components/LogViewer";
import { PlanningChat } from "./components/PlanningChat";
import { ProjectSelector } from "./components/ProjectSelector";
import { SessionHistory } from "./components/SessionHistory";
import { StatsBar } from "./components/StatsBar";
import { TaskTree } from "./components/TaskTree";
import { useWebSocket } from "./hooks/useWebSocket";
import { api } from "./lib/api";

type View = "dashboard" | "board" | "planning" | "history";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [projectPath, setProjectPath] = useState<string | null>(null);

  // Fetch current project
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project"],
    queryFn: api.getCurrentProject,
  });

  // WebSocket connection for real-time updates
  const { logs, loopStatus, stats, isConnected } = useWebSocket();

  useEffect(() => {
    if (project?.path) {
      setProjectPath(project.path);
    }
  }, [project]);

  // Request notification permission on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  if (projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            No Project Found
          </h1>
          <p className="text-muted-foreground mb-4">
            Initialize a daisy project first:
          </p>
          <code className="bg-muted px-3 py-2 rounded text-sm">
            daisy init /path/to/project
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">Daisy</h1>
          <ProjectSelector currentProject={project} />
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        </div>

        <nav className="flex gap-1">
          <button
            onClick={() => setView("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "dashboard"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Kanban className="h-4 w-4" />
            Board
          </button>
          <button
            onClick={() => setView("planning")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "planning"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Planning
          </button>
          <button
            onClick={() => setView("history")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === "history"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            History
          </button>
        </nav>
      </header>

      {/* Stats Bar */}
      <StatsBar stats={stats} loopStatus={loopStatus} />

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        {view === "dashboard" && (
          <>
            {/* Left: Tasks Panel */}
            <aside className="w-80 border-r border-border overflow-y-auto">
              <div className="p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  Tasks
                </h2>
                <TaskTree projectPath={projectPath} />
              </div>
            </aside>

            {/* Right: Logs + Controls */}
            <div className="flex flex-1 flex-col">
              <Controls projectPath={projectPath} loopStatus={loopStatus} />
              <LogViewer logs={logs} />
            </div>
          </>
        )}

        {view === "board" && <KanbanBoard projectPath={projectPath} />}

        {view === "planning" && <PlanningChat projectPath={projectPath} />}

        {view === "history" && <SessionHistory projectPath={projectPath} />}
      </main>
    </div>
  );
}
