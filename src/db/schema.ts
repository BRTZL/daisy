import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Projects table - multiple projects can exist
 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  path: text("path").notNull().unique(), // Project root path
  config: text("config", { mode: "json" }), // Project-specific config (JSON)
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Sections (from tasks.json)
 */
export const sections = sqliteTable("sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  externalId: integer("external_id").notNull(), // ID from tasks.json
  name: text("name").notNull(),
  status: text("status").notNull(), // pending | completed | partial
  order: integer("order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Items (tasks within sections)
 */
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionId: integer("section_id")
    .notNull()
    .references(() => sections.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  status: text("status").notNull(), // pending | passed | skipped
  note: text("note"),
  order: integer("order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Iterations (loop runs)
 */
export const iterations = sqliteTable("iterations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  iterationNumber: integer("iteration_number").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  status: text("status").notNull(), // running | completed | failed | stopped
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheCreateTokens: integer("cache_create_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  costUsd: integer("cost_usd", { mode: "number" }),
  complete: integer("complete", { mode: "boolean" }).notNull().default(false), // Whether ALL tasks completed
  errorMessage: text("error_message"),
});

/**
 * Status snapshots (for tracking progress over time)
 */
export const statusSnapshots = sqliteTable("status_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  iterationId: integer("iteration_id")
    .notNull()
    .references(() => iterations.id, { onDelete: "cascade" }),
  sectionId: integer("section_id").references(() => sections.id, {
    onDelete: "set null",
  }),
  sectionName: text("section_name").notNull(),
  phase: text("phase").notNull(), // selecting | implementing | testing | committing | done
  message: text("message").notNull(),
  itemsTotal: integer("items_total").notNull(),
  itemsCompleted: integer("items_completed").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Usage tracking (aggregate stats)
 */
export const usage = sqliteTable("usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  totalCacheCreateTokens: integer("total_cache_create_tokens")
    .notNull()
    .default(0),
  totalCacheReadTokens: integer("total_cache_read_tokens").notNull().default(0),
  totalCostUsd: integer("total_cost_usd", { mode: "number" }),
  totalIterations: integer("total_iterations").notNull().default(0),
  lastUpdated: integer("last_updated", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Prompts (prompt templates for different project types)
 */
export const prompts = sqliteTable("prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Type exports for TypeScript
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Iteration = typeof iterations.$inferSelect;
export type NewIteration = typeof iterations.$inferInsert;
export type StatusSnapshot = typeof statusSnapshots.$inferSelect;
export type NewStatusSnapshot = typeof statusSnapshots.$inferInsert;
export type Usage = typeof usage.$inferSelect;
export type NewUsage = typeof usage.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
