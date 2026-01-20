import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { api, type Task } from "../../lib/api";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { KanbanCardOverlay } from "./KanbanCard";
import { type ColumnStatus, KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
  projectPath: string | null;
}

// Helper to flatten nested tasks
function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  function walk(taskList: Task[]) {
    for (const task of taskList) {
      result.push(task);
      if (task.tasks && task.tasks.length > 0) {
        walk(task.tasks);
      }
    }
  }
  walk(tasks);
  return result;
}

// Column order for display
const COLUMN_ORDER: ColumnStatus[] = [
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "skipped",
];


export function KanbanBoard({ projectPath }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
  });

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: api.getTasks,
    enabled: !!projectPath,
    refetchInterval: 5000,
  });

  // Update task mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Task>) =>
      api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Delete task mutation
  const deleteMutation = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedTask(null);
    },
  });

  // Flatten tasks and group by status
  const flatTasks = flattenTasks(tasks);
  const tasksByStatus: Record<ColumnStatus, Task[]> = {
    pending: [],
    in_progress: [],
    completed: [],
    skipped: [],
    blocked: [],
  };

  for (const task of flatTasks) {
    tasksByStatus[task.status].push(task);
  }

  // DnD sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = flatTasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Could be used for visual feedback during drag
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTask = flatTasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    // Determine the target status
    let targetStatus: ColumnStatus | null = null;

    // Check if dropped on a column
    if (COLUMN_ORDER.includes(over.id as ColumnStatus)) {
      targetStatus = over.id as ColumnStatus;
    }
    // Check if dropped on another task - get that task's status
    else {
      const overTask = flatTasks.find((t) => t.id === over.id);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    // Update task status if changed
    if (targetStatus && activeTask.status !== targetStatus) {
      updateMutation.mutate({
        id: activeTask.id,
        status: targetStatus,
      });
    }
  };

  // Task detail handlers
  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
    });
    setIsEditing(false);
  };

  const handleCloseDetail = () => {
    setSelectedTask(null);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (!selectedTask) return;
    updateMutation.mutate({
      id: selectedTask.id,
      title: editForm.title,
      description: editForm.description || undefined,
    });
    setIsEditing(false);
  };

  const handleStatusChange = (status: ColumnStatus) => {
    if (!selectedTask) return;
    updateMutation.mutate({
      id: selectedTask.id,
      status,
    });
    setSelectedTask({ ...selectedTask, status });
  };

  const handleDelete = () => {
    if (!selectedTask) return;
    if (confirm(`Delete task "${selectedTask.title}"?`)) {
      deleteMutation.mutate(selectedTask.id);
    }
  };

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "blocked":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    );
  }

  if (flatTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-foreground mb-1">
            No tasks yet
          </h3>
          <p className="text-sm text-muted-foreground">
            Create tasks in the Dashboard view or use the planning chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 p-4 overflow-x-auto h-full kanban-board-scroll">
          {COLUMN_ORDER.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={handleTaskClick}
            />
          ))}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => handleCloseDetail()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {isEditing ? (
                      <Input
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        className="text-lg font-semibold"
                        autoFocus
                      />
                    ) : (
                      <DialogTitle className="text-lg">
                        {selectedTask.title}
                      </DialogTitle>
                    )}
                    <DialogDescription className="font-mono text-xs mt-1">
                      {selectedTask.id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Status */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Status
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {COLUMN_ORDER.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className={`
                          flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                          transition-all duration-200
                          ${
                            selectedTask.status === status
                              ? "bg-primary text-primary-foreground scale-105"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }
                        `}
                      >
                        {getStatusIcon(status)}
                        <span className="capitalize">
                          {status.replace("_", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Description
                  </Label>
                  {isEditing ? (
                    <Textarea
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Add a description..."
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                      {selectedTask.description || (
                        <span className="text-muted-foreground italic">
                          No description
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Dependencies */}
                {selectedTask.dependsOn &&
                  selectedTask.dependsOn.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Dependencies
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.dependsOn.map((depId) => (
                          <span
                            key={depId}
                            className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded font-mono"
                          >
                            <ChevronRight className="h-3 w-3" />
                            {depId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Acceptance Criteria */}
                {selectedTask.acceptanceCriteria &&
                  selectedTask.acceptanceCriteria.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Acceptance Criteria
                      </Label>
                      <ul className="space-y-1">
                        {selectedTask.acceptanceCriteria.map((criteria, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-foreground/80"
                          >
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            {criteria}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Subtasks */}
                {selectedTask.tasks && selectedTask.tasks.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Subtasks
                    </Label>
                    <div className="space-y-1.5">
                      {selectedTask.tasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50"
                        >
                          {getStatusIcon(subtask.status)}
                          <span className="flex-1">{subtask.title}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {subtask.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completion Summary */}
                {selectedTask.completionSummary && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Completion Summary
                    </Label>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                      {selectedTask.completionSummary}
                    </p>
                  </div>
                )}

                {/* Skip Reason */}
                {selectedTask.skipReason && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Skip Reason
                    </Label>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap bg-gray-500/10 p-3 rounded-lg border border-gray-500/20">
                      {selectedTask.skipReason}
                    </p>
                  </div>
                )}

                {/* Meta Info */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                  {selectedTask.createdAt && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Created
                      </Label>
                      <p className="text-sm">
                        {new Date(selectedTask.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selectedTask.completedAt && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Completed
                      </Label>
                      <p className="text-sm">
                        {new Date(
                          selectedTask.completedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selectedTask.attempts !== undefined && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Attempts
                      </Label>
                      <p className="text-sm">
                        {selectedTask.attempts}
                        {selectedTask.maxAttempts
                          ? ` / ${selectedTask.maxAttempts}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-row justify-between sm:justify-between">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                      >
                        Save Changes
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
