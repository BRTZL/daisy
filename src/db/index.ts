import { existsSync, mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Get global database path (~/.ralph-looper/database.sqlite)
 */
export function getGlobalDbPath(): string {
  const dbDir = path.join(os.homedir(), ".ralph-looper");

  // Create directory if it doesn't exist
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, "database.sqlite");
}

/**
 * Get project-local database path
 */
export function getProjectDbPath(projectPath: string): string {
  const dbDir = path.join(projectPath, ".ralph-looper");

  // Create directory if it doesn't exist
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, "database.sqlite");
}

/**
 * Create database connection
 */
export function createDatabase(dbPath: string): {
  db: DrizzleDB;
  sqlite: Database.Database;
} {
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrency
  sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

/**
 * Ensure all tables exist (create if needed)
 */
export function ensureTables(sqlite: Database.Database): void {
  // Check if projects table exists
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    )
    .get();

  if (!tables) {
    // Create all tables directly using SQL
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        path TEXT NOT NULL UNIQUE,
        config TEXT DEFAULT '{"is_active": 0}',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        external_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS iterations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        iteration_number INTEGER NOT NULL,
        started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        completed_at INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_create_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        complete INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS status_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_id INTEGER NOT NULL,
        section_id INTEGER,
        section_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        message TEXT NOT NULL,
        items_total INTEGER NOT NULL,
        items_completed INTEGER NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (iteration_id) REFERENCES iterations(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_cache_create_tokens INTEGER NOT NULL DEFAULT 0,
        total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL,
        total_iterations INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
      CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);
      CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id);
      CREATE INDEX IF NOT EXISTS idx_items_section ON items(section_id);
      CREATE INDEX IF NOT EXISTS idx_iterations_project ON iterations(project_id);
      CREATE INDEX IF NOT EXISTS idx_status_snapshots_iteration ON status_snapshots(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_usage_project ON usage(project_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
    `);
  }
}

/**
 * Get global database connection
 */
export function getGlobalDb(): DrizzleDB {
  const dbPath = getGlobalDbPath();
  const { db } = createDatabase(dbPath);
  return db;
}
