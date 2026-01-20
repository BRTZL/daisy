// API client for communicating with the Daisy backend

const BASE_URL = "/api";

export interface Project {
  name: string;
  path: string;
  config: {
    loop?: {
      maxIterations?: number;
      maxAttemptsPerTask?: number;
    };
  };
  stats: TaskStats;
}

export interface KnownProject {
  path: string;
  name: string;
  addedAt: string;
  lastUsedAt?: string;
  isCurrent?: boolean;
}

export interface ProjectsList {
  projects: KnownProject[];
  currentPath: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  attempts?: number;
  maxAttempts?: number;
  skipReason?: string;
  completionSummary?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  tasks?: Task[];
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
  blocked: number;
}

export interface LoopStatus {
  running: boolean;
  iteration: number;
  maxIterations: number | null;
  mode: "task-based" | "open-ended";
  startedAt: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export interface Session {
  id: string;
  startedAt: string;
  completedAt: string | null;
  iterations: number;
  mode: "task-based" | "open-ended";
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  tasksCompleted: string[];
  status: "running" | "completed" | "stopped" | "error";
}

export interface Settings {
  skipPermissions: boolean;
  defaultMaxIterations: number | null;
  notifications: boolean;
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Projects
  getProjects: () => fetchJSON<ProjectsList>("/projects"),
  getCurrentProject: () => fetchJSON<Project>("/projects/current"),
  switchProject: (path: string) =>
    fetchJSON<{ success: boolean; project: Project }>("/projects/use", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  removeProject: (path: string) =>
    fetchJSON<{ success: boolean }>(`/projects/${encodeURIComponent(path)}`, {
      method: "DELETE",
    }),

  // Tasks
  getTasks: () => fetchJSON<Task[]>("/tasks"),
  createTask: (task: Omit<Task, "createdAt" | "updatedAt"> & { parentId?: string }) =>
    fetchJSON<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),
  updateTask: (id: string, updates: Partial<Task>) =>
    fetchJSON<Task>(`/tasks/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  deleteTask: (id: string) =>
    fetchJSON<{ success: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Stats
  getStats: () => fetchJSON<TaskStats>("/stats"),

  // Loop
  getLoopStatus: () => fetchJSON<LoopStatus>("/loop/status"),
  startLoop: (options?: { maxIterations?: number; useTasks?: boolean; skipPermissions?: boolean }) =>
    fetchJSON<{ success: boolean }>("/loop/start", {
      method: "POST",
      body: JSON.stringify(options || {}),
    }),
  stopLoop: () =>
    fetchJSON<{ success: boolean }>("/loop/stop", {
      method: "POST",
    }),

  // History
  getHistory: () => fetchJSON<Session[]>("/history"),

  // Settings
  getSettings: () => fetchJSON<Settings>("/settings"),
  updateSettings: (settings: Partial<Settings>) =>
    fetchJSON<Settings>("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Planning
  sendPlanningMessage: (message: string) =>
    fetchJSON<{ response: string }>("/planning/message", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};
