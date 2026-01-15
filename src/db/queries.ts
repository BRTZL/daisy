import { and, asc, desc, eq } from "drizzle-orm";
import type {
  IterationStatus,
  Phase,
  SectionStatus,
  TaskStatus,
  TokenUsage,
} from "../core/types.js";
import type { DrizzleDB } from "./index";
import * as schema from "./schema";

/**
 * Project queries
 */
export async function getActiveProject(db: DrizzleDB) {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.isActive, true))
    .limit(1);

  return projects[0] || null;
}

export async function getProjectById(db: DrizzleDB, id: number) {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .limit(1);
  return projects[0] || null;
}

export async function getProjectByPath(db: DrizzleDB, path: string) {
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.path, path))
    .limit(1);
  return projects[0] || null;
}

export async function listProjects(db: DrizzleDB) {
  return db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.updatedAt));
}

export async function createProject(
  db: DrizzleDB,
  data: {
    name: string;
    description?: string;
    path: string;
    config?: Record<string, unknown>;
  }
) {
  const result = await db.insert(schema.projects).values(data).returning();
  return result[0];
}

export async function updateProject(
  db: DrizzleDB,
  id: number,
  data: Partial<{
    name: string;
    description: string;
    config: Record<string, unknown>;
    isActive: boolean;
  }>
) {
  const result = await db
    .update(schema.projects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.projects.id, id))
    .returning();
  return result[0];
}

export async function deleteProject(db: DrizzleDB, id: number) {
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
}

export async function setActiveProject(db: DrizzleDB, id: number) {
  // Deactivate all projects
  await db
    .update(schema.projects)
    .set({ isActive: false })
    .where(eq(schema.projects.isActive, true));

  // Activate the selected project
  const result = await db
    .update(schema.projects)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(schema.projects.id, id))
    .returning();
  return result[0];
}

/**
 * Section queries
 */
export async function getSectionsByProject(db: DrizzleDB, projectId: number) {
  return db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.projectId, projectId))
    .orderBy(asc(schema.sections.order));
}

export async function getSectionByExternalId(
  db: DrizzleDB,
  projectId: number,
  externalId: number
) {
  const sections = await db
    .select()
    .from(schema.sections)
    .where(
      and(
        eq(schema.sections.projectId, projectId),
        eq(schema.sections.externalId, externalId)
      )
    )
    .limit(1);
  return sections[0] || null;
}

export async function getSectionById(db: DrizzleDB, id: number) {
  const sections = await db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.id, id))
    .limit(1);
  return sections[0] || null;
}

export async function createSection(
  db: DrizzleDB,
  data: {
    projectId: number;
    externalId: number;
    name: string;
    status: SectionStatus;
    order: number;
  }
) {
  const result = await db.insert(schema.sections).values(data).returning();
  return result[0];
}

export async function updateSection(
  db: DrizzleDB,
  id: number,
  data: Partial<{
    name: string;
    status: SectionStatus;
    order: number;
  }>
) {
  const result = await db
    .update(schema.sections)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.sections.id, id))
    .returning();
  return result[0];
}

export async function deleteSection(db: DrizzleDB, id: number) {
  await db.delete(schema.sections).where(eq(schema.sections.id, id));
}

/**
 * Item queries
 */
export async function getItemsBySection(db: DrizzleDB, sectionId: number) {
  return db
    .select()
    .from(schema.items)
    .where(eq(schema.items.sectionId, sectionId))
    .orderBy(asc(schema.items.order));
}

export async function createItem(
  db: DrizzleDB,
  data: {
    sectionId: number;
    text: string;
    status: TaskStatus;
    note?: string;
    order: number;
  }
) {
  const result = await db.insert(schema.items).values(data).returning();
  return result[0];
}

export async function updateItem(
  db: DrizzleDB,
  id: number,
  data: Partial<{
    text: string;
    status: TaskStatus;
    note: string;
    order: number;
  }>
) {
  const result = await db
    .update(schema.items)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.items.id, id))
    .returning();
  return result[0];
}

export async function updateItemStatus(
  db: DrizzleDB,
  id: number,
  status: TaskStatus,
  note?: string
) {
  return updateItem(db, id, { status, note });
}

export async function deleteItem(db: DrizzleDB, id: number) {
  await db.delete(schema.items).where(eq(schema.items.id, id));
}

/**
 * Iteration queries
 */
export async function getIterationsByProject(db: DrizzleDB, projectId: number) {
  return db
    .select()
    .from(schema.iterations)
    .where(eq(schema.iterations.projectId, projectId))
    .orderBy(desc(schema.iterations.startedAt));
}

export async function getLatestIteration(db: DrizzleDB, projectId: number) {
  const iterations = await db
    .select()
    .from(schema.iterations)
    .where(eq(schema.iterations.projectId, projectId))
    .orderBy(desc(schema.iterations.startedAt))
    .limit(1);
  return iterations[0] || null;
}

export async function createIteration(
  db: DrizzleDB,
  data: {
    projectId: number;
    iterationNumber: number;
    status: IterationStatus;
  }
) {
  const result = await db
    .insert(schema.iterations)
    .values({
      ...data,
      startedAt: new Date(),
      inputTokens: 0,
      outputTokens: 0,
      cacheCreateTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      complete: false,
    })
    .returning();
  return result[0];
}

export async function updateIteration(
  db: DrizzleDB,
  id: number,
  data: Partial<{
    completedAt: Date;
    status: IterationStatus;
    inputTokens: number;
    outputTokens: number;
    cacheCreateTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    complete: boolean;
    errorMessage: string | null;
  }>
) {
  const result = await db
    .update(schema.iterations)
    .set(data)
    .where(eq(schema.iterations.id, id))
    .returning();
  return result[0];
}

export async function completeIteration(
  db: DrizzleDB,
  id: number,
  usage: TokenUsage,
  complete: boolean
) {
  return updateIteration(db, id, {
    completedAt: new Date(),
    status: "completed",
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheCreateTokens: usage.cacheCreateTokens,
    cacheReadTokens: usage.cacheReadTokens,
    costUsd: usage.costUsd,
    complete,
  });
}

/**
 * Status snapshot queries
 */
export async function getStatusSnapshotsByIteration(
  db: DrizzleDB,
  iterationId: number
) {
  return db
    .select()
    .from(schema.statusSnapshots)
    .where(eq(schema.statusSnapshots.iterationId, iterationId))
    .orderBy(asc(schema.statusSnapshots.timestamp));
}

export async function createStatusSnapshot(
  db: DrizzleDB,
  data: {
    iterationId: number;
    sectionId: number | null;
    sectionName: string;
    phase: Phase;
    message: string;
    itemsTotal: number;
    itemsCompleted: number;
  }
) {
  const result = await db
    .insert(schema.statusSnapshots)
    .values(data)
    .returning();
  return result[0];
}

/**
 * Usage queries
 */
export async function getUsageByProject(db: DrizzleDB, projectId: number) {
  const usageRecords = await db
    .select()
    .from(schema.usage)
    .where(eq(schema.usage.projectId, projectId))
    .limit(1);
  return usageRecords[0] || null;
}

export async function createUsage(db: DrizzleDB, projectId: number) {
  const result = await db
    .insert(schema.usage)
    .values({
      projectId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreateTokens: 0,
      totalCacheReadTokens: 0,
      totalCostUsd: 0,
      totalIterations: 0,
    })
    .returning();
  return result[0];
}

export async function updateUsage(
  db: DrizzleDB,
  projectId: number,
  data: {
    inputTokens: number;
    outputTokens: number;
    cacheCreateTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  }
) {
  const usage = await getUsageByProject(db, projectId);

  if (!usage) {
    const result = await db
      .insert(schema.usage)
      .values({
        projectId,
        totalInputTokens: data.inputTokens,
        totalOutputTokens: data.outputTokens,
        totalCacheCreateTokens: data.cacheCreateTokens,
        totalCacheReadTokens: data.cacheReadTokens,
        totalCostUsd: data.costUsd,
        totalIterations: 1,
      })
      .returning();
    return result[0];
  }

  const result = await db
    .update(schema.usage)
    .set({
      totalInputTokens: usage.totalInputTokens + data.inputTokens,
      totalOutputTokens: usage.totalOutputTokens + data.outputTokens,
      totalCacheCreateTokens:
        usage.totalCacheCreateTokens + data.cacheCreateTokens,
      totalCacheReadTokens: usage.totalCacheReadTokens + data.cacheReadTokens,
      totalCostUsd: (usage.totalCostUsd || 0) + data.costUsd,
      totalIterations: usage.totalIterations + 1,
      lastUpdated: new Date(),
    })
    .where(eq(schema.usage.id, usage.id))
    .returning();
  return result[0];
}

/**
 * Prompt queries
 */
export async function getActivePrompt(db: DrizzleDB, projectId?: number) {
  const conditions = projectId
    ? and(
        eq(schema.prompts.isActive, true),
        eq(schema.prompts.projectId, projectId)
      )
    : eq(schema.prompts.isActive, true);

  const prompts = await db
    .select()
    .from(schema.prompts)
    .where(conditions)
    .limit(1);
  return prompts[0] || null;
}

export async function createPrompt(
  db: DrizzleDB,
  data: {
    projectId?: number;
    name: string;
    content: string;
  }
) {
  const result = await db.insert(schema.prompts).values(data).returning();
  return result[0];
}

export async function updatePrompt(
  db: DrizzleDB,
  id: number,
  data: Partial<{
    name: string;
    content: string;
    isActive: boolean;
  }>
) {
  const result = await db
    .update(schema.prompts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.prompts.id, id))
    .returning();
  return result[0];
}

export async function deletePrompt(db: DrizzleDB, id: number) {
  await db.delete(schema.prompts).where(eq(schema.prompts.id, id));
}

/**
 * Import tasks from tasks.json
 */
export async function importTasksFromJSON(
  db: DrizzleDB,
  projectId: number,
  tasksData: {
    sections: Array<{
      id: number;
      name: string;
      status: string;
      items: Array<{ text: string; status: string; note?: string }>;
    }>;
  }
) {
  for (const sectionData of tasksData.sections) {
    // Create or update section
    const existingSection = await getSectionByExternalId(
      db,
      projectId,
      sectionData.id
    );

    let sectionId: number;
    if (existingSection) {
      const updated = await updateSection(db, existingSection.id, {
        name: sectionData.name,
        status: sectionData.status as SectionStatus,
      });
      sectionId = updated.id;
    } else {
      const created = await createSection(db, {
        projectId,
        externalId: sectionData.id,
        name: sectionData.name,
        status: sectionData.status as SectionStatus,
        order: sectionData.id,
      });
      sectionId = created.id;
    }

    // Create or update items
    for (let i = 0; i < sectionData.items.length; i++) {
      const itemData = sectionData.items[i];
      const existingItems = await getItemsBySection(db, sectionId);
      const existingItem = existingItems[i];

      if (existingItem) {
        await updateItem(db, existingItem.id, {
          text: itemData.text,
          status: itemData.status as TaskStatus,
          note: itemData.note,
          order: i,
        });
      } else {
        await createItem(db, {
          sectionId,
          text: itemData.text,
          status: itemData.status as TaskStatus,
          note: itemData.note,
          order: i,
        });
      }
    }
  }
}

/**
 * Export tasks to tasks.json format
 */
export async function exportTasksToJSON(db: DrizzleDB, projectId: number) {
  const sections = await getSectionsByProject(db, projectId);

  return {
    sections: await Promise.all(
      sections.map(async (section) => ({
        id: section.externalId,
        name: section.name,
        status: section.status,
        items: await getItemsBySection(db, section.id),
      }))
    ),
  };
}

/**
 * Get project statistics
 */
export async function getProjectStats(db: DrizzleDB, projectId: number) {
  const sections = await getSectionsByProject(db, projectId);
  const iterations = await getIterationsByProject(db, projectId);
  const usage = await getUsageByProject(db, projectId);

  const totalSections = sections.length;
  const completedSections = sections.filter(
    (s) => s.status === "completed"
  ).length;
  const pendingSections = sections.filter((s) => s.status === "pending").length;

  const allItems = await Promise.all(
    sections.map((s) => getItemsBySection(db, s.id))
  );
  const totalItems = allItems.flat().length;
  const completedItems = allItems
    .flat()
    .filter((i) => i.status === "passed").length;
  const pendingItems = allItems
    .flat()
    .filter((i) => i.status === "pending").length;
  const skippedItems = allItems
    .flat()
    .filter((i) => i.status === "skipped").length;

  const totalIterations = iterations.length;
  const completedIterations = iterations.filter(
    (i) => i.status === "completed"
  ).length;

  return {
    sections: {
      total: totalSections,
      completed: completedSections,
      pending: pendingSections,
    },
    items: {
      total: totalItems,
      completed: completedItems,
      pending: pendingItems,
      skipped: skippedItems,
    },
    iterations: {
      total: totalIterations,
      completed: completedIterations,
    },
    usage: usage
      ? {
          totalInputTokens: usage.totalInputTokens,
          totalOutputTokens: usage.totalOutputTokens,
          totalCacheCreateTokens: usage.totalCacheCreateTokens,
          totalCacheReadTokens: usage.totalCacheReadTokens,
          totalCostUsd: usage.totalCostUsd,
          totalIterations: usage.totalIterations,
        }
      : null,
  };
}
