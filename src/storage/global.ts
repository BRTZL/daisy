/**
 * Global Storage
 * Manages ~/.daisy/projects.json for tracking known projects
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

const DAISY_HOME = path.join(os.homedir(), ".daisy");
const PROJECTS_FILE = path.join(DAISY_HOME, "projects.json");

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
