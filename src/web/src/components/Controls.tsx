import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Settings2, Square } from "lucide-react";
import { useState } from "react";
import { api, type LoopStatus } from "../lib/api";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";

interface ControlsProps {
  projectPath: string | null;
  loopStatus: LoopStatus;
}

export function Controls({ projectPath, loopStatus }: ControlsProps) {
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [maxIterations, setMaxIterations] = useState<string>("");
  const [useTasks, setUseTasks] = useState(true);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const startMutation = useMutation({
    mutationFn: () =>
      api.startLoop({
        maxIterations: maxIterations ? parseInt(maxIterations, 10) : undefined,
        useTasks,
        skipPermissions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loop-status"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: api.stopLoop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loop-status"] });
    },
  });

  const handleStart = () => {
    startMutation.mutate();
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Start/Stop button */}
        {loopStatus.running ? (
          <button
            onClick={handleStop}
            disabled={stopMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            <Square className="h-4 w-4" />
            {stopMutation.isPending ? "Stopping..." : "Stop"}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!projectPath || startMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Play className="h-4 w-4" />
            {startMutation.isPending ? "Starting..." : "Start Loop"}
          </button>
        )}

        {/* Quick settings */}
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Checkbox
              id="useTasks"
              checked={useTasks}
              onCheckedChange={(checked) => setUseTasks(checked === true)}
              disabled={loopStatus.running}
            />
            <Label
              htmlFor="useTasks"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Use tasks
            </Label>
          </div>

          <input
            type="number"
            value={maxIterations}
            onChange={(e) => setMaxIterations(e.target.value)}
            placeholder="∞"
            disabled={loopStatus.running}
            className="w-16 px-2 py-1 text-sm bg-muted rounded-md border-none outline-none focus:ring-1 focus:ring-ring"
            title="Max iterations (leave empty for unlimited)"
          />
          <span className="text-muted-foreground text-xs">iterations</span>
        </div>

        <div className="flex-1" />

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-md transition-colors ${
            showSettings
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title="Settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mt-3 p-3 bg-muted rounded-md">
          <h3 className="text-sm font-medium mb-3">Loop Settings</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="skipPermissions" className="text-sm">
                  Skip permissions prompts
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pass --dangerously-skip-permissions to Claude
                </p>
              </div>
              <Checkbox
                id="skipPermissions"
                checked={skipPermissions}
                onCheckedChange={(checked) => setSkipPermissions(checked === true)}
                disabled={loopStatus.running}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notifications" className="text-sm">
                  Browser notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show notifications on completion or error
                </p>
              </div>
              <Checkbox
                id="notifications"
                checked={notifications}
                onCheckedChange={(checked) => setNotifications(checked === true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Status indicator */}
      {loopStatus.running && (
        <div className="mt-2 text-sm text-muted-foreground">
          Running iteration {loopStatus.iteration}
          {loopStatus.maxIterations && ` of ${loopStatus.maxIterations}`}
          {loopStatus.mode === "open-ended" && " (open-ended mode)"}
        </div>
      )}
    </div>
  );
}
