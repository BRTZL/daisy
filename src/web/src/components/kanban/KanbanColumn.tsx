import { useDroppable } from "@dnd-kit/core";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
} from "lucide-react";
import type { Task } from "../../lib/api";
import { KanbanCard } from "./KanbanCard";

export type ColumnStatus = Task["status"];

interface KanbanColumnProps {
  status: ColumnStatus;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const columnConfig: Record<
  ColumnStatus,
  {
    title: string;
    icon: React.ReactNode;
    bgColor: string;
    headerColor: string;
    dropIndicator: string;
  }
> = {
  pending: {
    title: "Pending",
    icon: <Circle className="h-4 w-4" />,
    bgColor: "bg-muted/30",
    headerColor: "text-muted-foreground",
    dropIndicator: "ring-muted-foreground/50 bg-muted/50",
  },
  in_progress: {
    title: "In Progress",
    icon: <Clock className="h-4 w-4" />,
    bgColor: "bg-blue-500/5",
    headerColor: "text-blue-500",
    dropIndicator: "ring-blue-500/50 bg-blue-500/10",
  },
  completed: {
    title: "Completed",
    icon: <CheckCircle2 className="h-4 w-4" />,
    bgColor: "bg-green-500/5",
    headerColor: "text-green-500",
    dropIndicator: "ring-green-500/50 bg-green-500/10",
  },
  skipped: {
    title: "Skipped",
    icon: <XCircle className="h-4 w-4" />,
    bgColor: "bg-gray-500/5",
    headerColor: "text-gray-500",
    dropIndicator: "ring-gray-500/50 bg-gray-500/10",
  },
  blocked: {
    title: "Blocked",
    icon: <AlertCircle className="h-4 w-4" />,
    bgColor: "bg-red-500/5",
    headerColor: "text-red-500",
    dropIndicator: "ring-red-500/50 bg-red-500/10",
  },
};

export function KanbanColumn({
  status,
  tasks,
  onTaskClick,
}: KanbanColumnProps) {
  const config = columnConfig[status];

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: "column",
      status,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col w-72 min-w-72 rounded-xl
        ${config.bgColor}
        transition-all duration-200
        ${isOver ? `ring-2 ${config.dropIndicator}` : ""}
      `}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border/50">
        <div className={`${config.headerColor}`}>{config.icon}</div>
        <h2 className={`text-sm font-semibold ${config.headerColor}`}>
          {config.title}
        </h2>
        <span
          className={`
            ml-auto text-xs font-medium px-2 py-0.5 rounded-full
            ${config.headerColor} bg-background/50
          `}
        >
          {tasks.length}
        </span>
      </div>

      {/* Cards Container */}
      <div
        className={`
          flex-1 p-2 space-y-2 overflow-y-auto
          min-h-[200px] max-h-[calc(100vh-280px)]
          kanban-scrollbar
        `}
      >
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
          />
        ))}

        {/* Empty state */}
        {tasks.length === 0 && (
          <div
            className={`
              flex items-center justify-center h-32
              border-2 border-dashed rounded-lg
              text-muted-foreground/50 text-sm
              ${isOver ? "border-current" : "border-border/50"}
            `}
          >
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}
