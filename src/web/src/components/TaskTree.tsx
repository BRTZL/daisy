import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Task } from "../lib/api";

// Find all task IDs that should be expanded (in_progress tasks and their parents)
function findTasksToExpand(tasks: Task[], parentIds: string[] = []): Set<string> {
  const result = new Set<string>();

  for (const task of tasks) {
    if (task.status === "in_progress") {
      // Add all parent IDs to the result
      for (const parentId of parentIds) {
        result.add(parentId);
      }
      // Also expand the in_progress task itself (to show its children if any)
      result.add(task.id);
    }

    // Recurse into children
    if (task.tasks && task.tasks.length > 0) {
      const childResults = findTasksToExpand(task.tasks, [...parentIds, task.id]);
      for (const id of childResults) {
        result.add(id);
      }
    }
  }

  return result;
}
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface TaskTreeProps {
  projectPath: string | null;
}

interface TaskFormData {
  id: string;
  title: string;
  description: string;
  parentId?: string;
}

export function TaskTree({ projectPath }: TaskTreeProps) {
  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | undefined>();
  const [formData, setFormData] = useState<TaskFormData>({
    id: "",
    title: "",
    description: "",
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: api.getTasks,
    enabled: !!projectPath,
    refetchInterval: 5000,
  });

  // Auto-expand in_progress tasks and their parents
  useEffect(() => {
    const tasksToExpand = findTasksToExpand(tasks);
    if (tasksToExpand.size > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of tasksToExpand) {
          next.add(id);
        }
        return next;
      });
    }
  }, [tasks]);

  const createMutation = useMutation({
    mutationFn: (data: TaskFormData) =>
      api.createTask({
        id: data.id,
        title: data.title,
        description: data.description || undefined,
        status: "pending",
        parentId: data.parentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Task>) =>
      api.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const openCreateDialog = (parentId?: string) => {
    setEditingTask(null);
    setParentTaskId(parentId);
    setFormData({
      id: generateTaskId(parentId),
      title: "",
      description: "",
      parentId,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setParentTaskId(undefined);
    setFormData({
      id: task.id,
      title: task.title,
      description: task.description || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTask(null);
    setParentTaskId(undefined);
    setFormData({ id: "", title: "", description: "" });
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) return;

    if (editingTask) {
      updateMutation.mutate({
        id: editingTask.id,
        title: formData.title,
        description: formData.description || undefined,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const generateTaskId = (parentId?: string): string => {
    const base = parentId ? `${parentId}-` : "task-";
    const num = Math.floor(Math.random() * 1000);
    return `${base}${num}`;
  };

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

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      case "skipped":
        return <XCircle className="h-4 w-4 text-gray-500" />;
      case "blocked":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderTask = (task: Task, depth: number = 0) => {
    const hasChildren = task.tasks && task.tasks.length > 0;
    const isExpanded = expandedIds.has(task.id);

    return (
      <div key={task.id} className="select-none">
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group ${
            task.status === "in_progress" ? "bg-blue-500/10" : ""
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* Expand/collapse icon */}
          <button
            className="w-4 h-4 flex items-center justify-center"
            onClick={() => hasChildren && toggleExpand(task.id)}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : null}
          </button>

          {/* Status icon */}
          {getStatusIcon(task.status)}

          {/* Task title */}
          <span
            className={`flex-1 text-sm truncate ${
              task.status === "completed"
                ? "text-muted-foreground line-through"
                : task.status === "skipped"
                  ? "text-muted-foreground"
                  : "text-foreground"
            }`}
            title={task.description || task.title}
          >
            {task.title}
          </span>

          {/* Action buttons (hidden until hover) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                openCreateDialog(task.id);
              }}
              title="Add subtask"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                openEditDialog(task);
              }}
              title="Edit task"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete task "${task.title}"?`)) {
                  deleteMutation.mutate(task.id);
                }
              }}
              title="Delete task"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>{task.tasks?.map((child) => renderTask(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading tasks...</div>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-3">No tasks yet</p>
          </div>
        ) : (
          tasks.map((task) => renderTask(task))
        )}
      </div>

      {/* Add task button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-4"
        onClick={() => openCreateDialog()}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Task
      </Button>

      {/* Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTask ? "Edit Task" : "Create Task"}
            </DialogTitle>
            <DialogDescription>
              {editingTask
                ? "Update the task details below."
                : parentTaskId
                  ? "Add a subtask to the selected task."
                  : "Add a new task to your project."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-id">Task ID</Label>
              <Input
                id="task-id"
                value={formData.id}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, id: e.target.value }))
                }
                placeholder="task-1"
                disabled={!!editingTask}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="What needs to be done?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Description (optional)</Label>
              <Textarea
                id="task-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Add more details..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.title.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
