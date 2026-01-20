import { Activity, CheckCircle2, Clock, DollarSign, Zap } from "lucide-react";
import type { LoopStatus, TaskStats } from "../lib/api";

interface StatsBarProps {
  stats: TaskStats;
  loopStatus: LoopStatus;
}

export function StatsBar({ stats, loopStatus }: StatsBarProps) {
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const formatCost = (cost: number) => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const progressPercent =
    stats.total > 0
      ? Math.round(((stats.completed + stats.skipped) / stats.total) * 100)
      : 0;

  return (
    <div className="flex items-center gap-6 border-b border-border px-4 py-2 text-sm">
      {/* Task progress */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-muted-foreground">Tasks:</span>
        <span className="font-medium">
          {stats.completed}/{stats.total}
        </span>
        {stats.total > 0 && (
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* In progress */}
      {stats.inProgress > 0 && (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
          <span className="text-muted-foreground">In progress:</span>
          <span className="font-medium text-blue-500">{stats.inProgress}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Iteration */}
      {loopStatus.running && (
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Iteration:</span>
          <span className="font-medium">
            {loopStatus.iteration}
            {loopStatus.maxIterations && `/${loopStatus.maxIterations}`}
          </span>
        </div>
      )}

      {/* Tokens */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-yellow-500" />
        <span className="text-muted-foreground">Tokens:</span>
        <span className="font-medium">
          {formatNumber(loopStatus.usage.inputTokens)} in /{" "}
          {formatNumber(loopStatus.usage.outputTokens)} out
        </span>
      </div>

      {/* Cost */}
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-green-500" />
        <span className="text-muted-foreground">Cost:</span>
        <span className="font-medium">
          {formatCost(loopStatus.usage.costUsd)}
        </span>
      </div>
    </div>
  );
}
