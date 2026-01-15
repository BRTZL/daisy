import { readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import type { SectionStatus, TaskStatus } from "../../core/types.js";
import { createDatabase, getGlobalDb } from "../../db/index.js";
import * as queries from "../../db/queries.js";

export const tasksCommand = new Command("tasks");

tasksCommand
  .description("Manage tasks")
  .option(
    "-s, --status <status>",
    "Filter by status (pending|passed|skipped|completed|partial)"
  )
  .option("-f, --filter <query>", "Filter tasks by query string")
  .option("-i, --interactive", "Interactive task selection")
  .action(async (options) => {
    const db = getGlobalDb();

    try {
      // Get active project
      const project = await queries.getActiveProject(db);

      if (!project) {
        console.log(chalk.yellow("No active project."));
        console.log();
        console.log(
          `Run ${chalk.cyan("ralph-looper project switch")} to select a project.`
        );
        return;
      }

      // Get project database
      const { db: projectDb } = createDatabase(
        path.join(project.path, ".ralph-looper", "database.sqlite")
      );

      // Get local project
      const localProject = await queries.getProjectByPath(
        projectDb,
        project.path
      );
      if (!localProject) {
        console.log(
          chalk.yellow("No local project found. Please run init first.")
        );
        return;
      }

      // Get sections
      const sections = await queries.getSectionsByProject(
        projectDb,
        localProject.id
      );

      // Filter sections if status filter is provided
      let filteredSections = sections;
      if (options.status) {
        const status = options.status.toLowerCase();
        if (["pending", "completed", "partial"].includes(status)) {
          filteredSections = sections.filter((s) => s.status === status);
        }
      }

      // Filter sections by query
      if (options.filter) {
        const query = options.filter.toLowerCase();
        filteredSections = filteredSections.filter((s) =>
          s.name.toLowerCase().includes(query)
        );
      }

      if (filteredSections.length === 0) {
        console.log(chalk.yellow("No tasks found."));
        return;
      }

      // Display tasks
      for (const section of filteredSections) {
        const items = await queries.getItemsBySection(projectDb, section.id);

        // Filter items if needed
        let filteredItems = items;
        if (
          options.status &&
          ["pending", "passed", "skipped"].includes(
            options.status.toLowerCase()
          )
        ) {
          filteredItems = items.filter(
            (i) => i.status === options.status.toLowerCase()
          );
        }
        if (options.filter) {
          const query = options.filter.toLowerCase();
          filteredItems = filteredItems.filter((i) =>
            i.text.toLowerCase().includes(query)
          );
        }

        if (filteredItems.length === 0) {
          continue;
        }

        // Section header
        const sectionStatus = getSectionStatusIcon(
          section.status as SectionStatus
        );
        console.log();
        console.log(
          `${sectionStatus} ${chalk.bold(section.name)} ${chalk.gray(`(Section ID: ${section.externalId})`)}`
        );

        // Items
        for (const item of filteredItems) {
          const itemStatus = getItemStatusIcon(item.status as TaskStatus);
          console.log(`  ${itemStatus} ${item.text}`);
          if (item.note) {
            console.log(`     ${chalk.gray(`Note: ${item.note}`)}`);
          }
        }

        // Summary
        const passed = items.filter((i) => i.status === "passed").length;
        const skipped = items.filter((i) => i.status === "skipped").length;
        const pending = items.filter((i) => i.status === "pending").length;
        console.log(
          `  ${chalk.gray(`Progress: ${passed}/${items.length} passed`)}${skipped > 0 ? chalk.gray(`, ${skipped} skipped`) : ""}${pending > 0 ? chalk.gray(`, ${pending} pending`) : ""}`
        );
      }

      console.log();

      // Overall summary
      const allItems = await Promise.all(
        sections.map((s) => queries.getItemsBySection(projectDb, s.id))
      );
      const totalItems = allItems.flat().length;
      const totalPassed = allItems
        .flat()
        .filter((i) => i.status === "passed").length;
      const totalSkipped = allItems
        .flat()
        .filter((i) => i.status === "skipped").length;
      const totalPending = allItems
        .flat()
        .filter((i) => i.status === "pending").length;

      console.log(chalk.bold("Overall Progress:"));
      console.log(`  Total tasks:  ${totalItems}`);
      console.log(
        `  Completed:    ${totalPassed} ${chalk.gray(`(${Math.round((totalPassed / totalItems) * 100)}%)`)}`
      );
      if (totalSkipped > 0) {
        console.log(`  Skipped:      ${totalSkipped}`);
      }
      if (totalPending > 0) {
        console.log(`  Pending:      ${totalPending}`);
      }
      console.log();
    } catch (error) {
      console.error(chalk.red("Failed to list tasks"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function getSectionStatusIcon(status: SectionStatus): string {
  switch (status) {
    case "completed":
      return chalk.green("✓");
    case "partial":
      return chalk.yellow("◐");
    case "pending":
      return chalk.gray("○");
    default:
      return chalk.gray("○");
  }
}

function getItemStatusIcon(status: TaskStatus): string {
  switch (status) {
    case "passed":
      return chalk.green("✓");
    case "skipped":
      return chalk.yellow("○");
    case "pending":
      return chalk.gray("○");
    default:
      return chalk.gray("○");
  }
}

// Import command
tasksCommand
  .command("import [file]")
  .description("Import tasks from tasks.json file")
  .action(async (file) => {
    const db = getGlobalDb();

    try {
      // Get active project
      const project = await queries.getActiveProject(db);

      if (!project) {
        console.log(chalk.yellow("No active project."));
        console.log();
        console.log(
          `Run ${chalk.cyan("ralph-looper project switch")} to select a project.`
        );
        return;
      }

      // Determine tasks file path
      const tasksPath = file
        ? path.resolve(file)
        : path.join(project.path, "tasks.json");

      console.log(chalk.blue(`Importing tasks from ${tasksPath}...`));

      // Read tasks file
      const tasksContent = readFileSync(tasksPath, "utf-8");
      const tasksData = JSON.parse(tasksContent);

      // Get project database
      const { db: projectDb } = createDatabase(
        path.join(project.path, ".ralph-looper", "database.sqlite")
      );

      // Get or create local project
      let localProject = await queries.getProjectByPath(
        projectDb,
        project.path
      );
      if (!localProject) {
        localProject = await queries.createProject(projectDb, {
          name: project.name,
          path: project.path,
          config: project.config as Record<string, unknown>,
        });
      }

      // Import tasks
      await queries.importTasksFromJSON(projectDb, localProject.id, tasksData);

      console.log(chalk.green("✓ Tasks imported successfully!"));

      // Show summary
      const sections = await queries.getSectionsByProject(
        projectDb,
        localProject.id
      );
      const allItems = await Promise.all(
        sections.map((s) => queries.getItemsBySection(projectDb, s.id))
      );
      const totalItems = allItems.flat().length;
      const totalPassed = allItems
        .flat()
        .filter((i) => i.status === "passed").length;
      const totalPending = allItems
        .flat()
        .filter((i) => i.status === "pending").length;

      console.log();
      console.log(chalk.bold("Import Summary:"));
      console.log(`  Sections:     ${sections.length}`);
      console.log(`  Total tasks:  ${totalItems}`);
      console.log(`  Completed:    ${totalPassed}`);
      console.log(`  Pending:      ${totalPending}`);
      console.log();
    } catch (error) {
      console.error(chalk.red("Failed to import tasks"));
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(chalk.yellow(`File not found: ${file || "tasks.json"}`));
      } else {
        console.error(error instanceof Error ? error.message : String(error));
      }
      process.exit(1);
    }
  });
