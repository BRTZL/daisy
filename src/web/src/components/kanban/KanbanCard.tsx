import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  GripVertical,
  Layers,
  XCircle,
} from "lucide-react";
import type { Task } from "../../lib/api";

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
}

export function KanbanCard({ task, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: task.id,
    data: {
      type: "task",
      task,
      status: task.status,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return "border-l-green-500";
      case "in_progress":
        return "border-l-blue-500";
      case "blocked":
        return "border-l-red-500";
      case "skipped":
        return "border-l-gray-500";
      default:
        return "border-l-muted-foreground/30";
    }
  };

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "in_progress":
        return <Clock className="h-3.5 w-3.5 text-blue-500" />;
      case "blocked":
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      case "skipped":
        return <XCircle className="h-3.5 w-3.5 text-gray-500" />;
      default:
        return null;
    }
  };

  const subtaskCount = task.tasks?.length || 0;
  const completedSubtasks =
    task.tasks?.filter((t) => t.status === "completed").length || 0;

  const handleClick = () => {
    // Only trigger click if not dragging
    if (!isDragging) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className={`
        group relative bg-card rounded-lg border border-border shadow-sm
        border-l-4 ${getStatusColor(task.status)}
        transition-all duration-200 ease-out
        cursor-grab active:cursor-grabbing
        ${isDragging ? "opacity-50 shadow-lg scale-105 z-50" : ""}
        hover:shadow-md hover:border-border/80
        touch-none
      `}
    >
      {/* Drag indicator */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Card Content */}
      <div className="p-3 pl-5">
        {/* Title */}
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-medium text-foreground flex-1 line-clamp-2">
            {task.title}
          </h3>
          {getStatusIcon(task.status)}
        </div>

        {/* Description preview */}
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2">
          {/* Subtask count */}
          {subtaskCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Layers className="h-3 w-3" />
              <span>
                {completedSubtasks}/{subtaskCount}
              </span>
            </div>
          )}

          {/* Dependencies */}
          {task.dependsOn && task.dependsOn.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ChevronRight className="h-3 w-3" />
              <span>{task.dependsOn.length} dep</span>
            </div>
          )}

          {/* Attempts */}
          {task.attempts && task.attempts > 0 && (
            <div className="text-xs text-orange-500">
              Attempt {task.attempts}
              {task.maxAttempts ? `/${task.maxAttempts}` : ""}
            </div>
          )}
        </div>

        {/* Task ID */}
        <div className="mt-2 text-[10px] text-muted-foreground/60 font-mono">
          {task.id}
        </div>
      </div>
    </div>
  );
}

// Overlay card shown during drag
export function KanbanCardOverlay({ task }: { task: Task }) {
  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return "border-l-green-500";
      case "in_progress":
        return "border-l-blue-500";
      case "blocked":
        return "border-l-red-500";
      case "skipped":
        return "border-l-gray-500";
      default:
        return "border-l-muted-foreground/30";
    }
  };

  return (
    <div
      className={`
        bg-card rounded-lg border border-border shadow-2xl
        border-l-4 ${getStatusColor(task.status)}
        rotate-3 scale-105 w-[280px]
      `}
    >
      <div className="p-3 pl-5">
        <h3 className="text-sm font-medium text-foreground line-clamp-2">
          {task.title}
        </h3>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
            {task.description}
          </p>
        )}
      </div>
    </div>
  );
}
