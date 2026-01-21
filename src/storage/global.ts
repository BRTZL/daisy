/**
 * Global Storage
 * Manages ~/.daisy/ for global config and per-project data
 */

import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LoopSession } from "./types.js";

export interface KnownProject {
  path: string;
  name: string;
  addedAt: string;
  lastUsedAt?: string;
}

export interface GlobalConfig {
  projects: KnownProject[];
  currentProject?: string;
}

export interface ProjectSettings {
  /** Maximum iterations per run */
  maxIterations?: number;
  /** Max attempts per task before skipping */
  maxAttemptsPerTask?: number;
  /** Skip permission prompts in Claude */
  skipPermissions?: boolean;
  /** Show browser notifications */
  notifications?: boolean;
  /** Webhook configurations */
  webhooks?: WebhookConfig[];
}

export interface WebhookConfig {
  /** Display name for the webhook */
  name: string;
  /** URL to send POST requests to */
  url: string;
  /** Events to trigger on (e.g., "task.completed", "milestone.completed") */
  events: string[];
  /** Whether the webhook is active */
  active: boolean;
  /** Optional secret for signing payloads */
  secret?: string;
}

const DAISY_HOME = path.join(os.homedir(), ".daisy");
const PROJECTS_DIR = path.join(DAISY_HOME, "projects");
const PROJECTS_FILE = path.join(DAISY_HOME, "projects.json");

// ============================================================================
// Project Directory (per-project storage in ~/.daisy/projects/<hash>/)
// ============================================================================

/**
 * Generate a unique directory name for a project path
 * Uses a hash of the absolute path to create a stable, unique directory
 */
function getProjectHash(projectPath: string): string {
  const absolutePath = path.resolve(projectPath);
  const hash = crypto.createHash("sha256").update(absolutePath).digest("hex");
  // Use first 16 chars of hash + sanitized project name for readability
  const name = path.basename(absolutePath).replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${name}-${hash.substring(0, 16)}`;
}

/**
 * Get the global storage directory for a specific project
 * Returns: ~/.daisy/projects/<project-hash>/
 */
export function getProjectDataDir(projectPath: string): string {
  const projectHash = getProjectHash(projectPath);
  return path.join(PROJECTS_DIR, projectHash);
}

/**
 * Ensure the project data directory exists
 */
function ensureProjectDataDir(projectPath: string): string {
  const dir = getProjectDataDir(projectPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Ensure ~/.daisy directory exists
 */
function ensureDaisyHome(): void {
  if (!existsSync(DAISY_HOME)) {
    mkdirSync(DAISY_HOME, { recursive: true });
  }
}

/**
 * Get the global config
 */
export function getGlobalConfig(): GlobalConfig {
  ensureDaisyHome();

  if (!existsSync(PROJECTS_FILE)) {
    return { projects: [] };
  }

  try {
    const content = readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { projects: [] };
  }
}

/**
 * Save the global config
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureDaisyHome();
  writeFileSync(PROJECTS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Get list of known projects
 */
export function getKnownProjects(): KnownProject[] {
  const config = getGlobalConfig();
  // Filter out projects that no longer exist
  return config.projects.filter((p) => existsSync(path.join(p.path, ".daisy")));
}

/**
 * Add or update a project in the known projects list
 */
export function addKnownProject(projectPath: string): KnownProject {
  const config = getGlobalConfig();
  const absolutePath = path.resolve(projectPath);
  const name = path.basename(absolutePath);

  const existing = config.projects.find((p) => p.path === absolutePath);

  if (existing) {
    existing.lastUsedAt = new Date().toISOString();
    saveGlobalConfig(config);
    return existing;
  }

  const project: KnownProject = {
    path: absolutePath,
    name,
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  config.projects.push(project);
  saveGlobalConfig(config);
  return project;
}

/**
 * Remove a project from known projects
 */
export function removeKnownProject(projectPath: string): boolean {
  const config = getGlobalConfig();
  const absolutePath = path.resolve(projectPath);
  const index = config.projects.findIndex((p) => p.path === absolutePath);

  if (index === -1) {
    return false;
  }

  config.projects.splice(index, 1);

  // Clear current if it was the removed project
  if (config.currentProject === absolutePath) {
    config.currentProject = undefined;
  }

  saveGlobalConfig(config);
  return true;
}

/**
 * Set the current active project
 */
export function setCurrentProject(projectPath: string | null): void {
  const config = getGlobalConfig();

  if (projectPath) {
    const absolutePath = path.resolve(projectPath);
    config.currentProject = absolutePath;

    // Update lastUsedAt
    const project = config.projects.find((p) => p.path === absolutePath);
    if (project) {
      project.lastUsedAt = new Date().toISOString();
    }
  } else {
    config.currentProject = undefined;
  }

  saveGlobalConfig(config);
}

/**
 * Get the current active project path
 */
export function getCurrentProjectPath(): string | null {
  const config = getGlobalConfig();

  if (config.currentProject && existsSync(path.join(config.currentProject, ".daisy"))) {
    return config.currentProject;
  }

  return null;
}

// ============================================================================
// Project Settings (stored in ~/.daisy/projects/<hash>/settings.json)
// ============================================================================

const SETTINGS_FILE = "settings.json";

/**
 * Get project settings
 */
export function getProjectSettings(projectPath: string): ProjectSettings {
  const settingsPath = path.join(getProjectDataDir(projectPath), SETTINGS_FILE);

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save project settings
 */
export function saveProjectSettings(projectPath: string, settings: ProjectSettings): void {
  const dir = ensureProjectDataDir(projectPath);
  const settingsPath = path.join(dir, SETTINGS_FILE);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Update project settings (merge with existing)
 */
export function updateProjectSettings(projectPath: string, updates: Partial<ProjectSettings>): ProjectSettings {
  const current = getProjectSettings(projectPath);
  const updated = { ...current, ...updates };
  saveProjectSettings(projectPath, updated);
  return updated;
}

// ============================================================================
// Session History (stored in ~/.daisy/projects/<hash>/history.json)
// ============================================================================

const HISTORY_FILE = "history.json";
const MAX_HISTORY_ENTRIES = 100;

/**
 * Get all session history for a project
 */
export function getHistory(projectPath: string): LoopSession[] {
  const historyPath = path.join(getProjectDataDir(projectPath), HISTORY_FILE);

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = readFileSync(historyPath, "utf-8");
    const data = JSON.parse(content);
    return Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

/**
 * Save session history
 */
function saveHistory(projectPath: string, sessions: LoopSession[]): void {
  const dir = ensureProjectDataDir(projectPath);
  const historyPath = path.join(dir, HISTORY_FILE);
  writeFileSync(
    historyPath,
    JSON.stringify({ sessions }, null, 2),
    "utf-8"
  );
}

/**
 * Add a new session to history
 */
export function addSession(projectPath: string, session: LoopSession): void {
  const sessions = getHistory(projectPath);

  // Add new session at the beginning
  sessions.unshift(session);

  // Trim to max entries
  if (sessions.length > MAX_HISTORY_ENTRIES) {
    sessions.length = MAX_HISTORY_ENTRIES;
  }

  saveHistory(projectPath, sessions);
}

/**
 * Update an existing session in history
 */
export function updateSession(
  projectPath: string,
  sessionId: string,
  updates: Partial<LoopSession>
): boolean {
  const sessions = getHistory(projectPath);
  const index = sessions.findIndex((s) => s.id === sessionId);

  if (index === -1) {
    return false;
  }

  sessions[index] = { ...sessions[index], ...updates };
  saveHistory(projectPath, sessions);
  return true;
}

/**
 * Get a specific session by ID
 */
export function getSession(projectPath: string, sessionId: string): LoopSession | null {
  const sessions = getHistory(projectPath);
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}
