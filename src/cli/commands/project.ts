import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { getGlobalDb } from "../../db/index.js";
import * as queries from "../../db/queries.js";

export const projectCommand = new Command("project");

projectCommand.description("Manage ralph-looper projects");

// List projects
projectCommand
  .command("list")
  .alias("ls")
  .description("List all projects")
  .action(async () => {
    const db = getGlobalDb();

    try {
      const projects = await queries.listProjects(db);

      if (projects.length === 0) {
        console.log(chalk.yellow("No projects found."));
        console.log();
        console.log(
          `Run ${chalk.cyan("ralph-looper init")} to create a new project.`
        );
        return;
      }

      console.log();
      projects.forEach((project) => {
        const isActive = project.isActive ? chalk.green("●") : chalk.gray("○");
        console.log(
          `${isActive} ${chalk.bold(project.name)} ${chalk.gray(`(ID: ${project.id})`)}`
        );
        console.log(`   ${chalk.gray(project.path)}`);
        if (project.description) {
          console.log(`   ${chalk.gray(project.description)}`);
        }
        console.log();
      });
    } catch (error) {
      console.error(chalk.red("Failed to list projects"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Add existing project
projectCommand
  .command("add")
  .description("Add an existing project to ralph-looper")
  .argument("[path]", "Project path (default: current directory)", ".")
  .option("-n, --name <name>", "Project name")
  .action(async (projectPath: string, options) => {
    const spinner = ora("Adding project...").start();

    try {
      const absolutePath = path.resolve(projectPath);

      // Check if directory exists
      if (!require("node:fs").existsSync(absolutePath)) {
        spinner.fail(`Path does not exist: ${absolutePath}`);
        process.exit(1);
      }

      const db = getGlobalDb();

      // Check if project already exists
      const existingProject = await queries.getProjectByPath(db, absolutePath);
      if (existingProject) {
        spinner.fail(`Project already exists: ${existingProject.name}`);
        process.exit(1);
      }

      // Get project name
      let projectName = options.name || path.basename(absolutePath);

      // Ask for name if not provided
      if (!options.name) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Project name:",
            default: projectName,
          },
        ]);
        projectName = answers.name;
        spinner.start();
      }

      // Create project
      const project = await queries.createProject(db, {
        name: projectName,
        path: absolutePath,
        config: {},
      });

      spinner.succeed(`Added project: ${chalk.bold(projectName)}`);
      console.log();
      console.log(chalk.gray("Project ID:"), project.id);
      console.log(chalk.gray("Path:"), absolutePath);
      console.log();
      console.log(
        `Run ${chalk.cyan(`ralph-looper project switch ${project.id}`)} to make it active.`
      );
    } catch (error) {
      spinner.fail("Failed to add project");
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// Switch active project
projectCommand
  .command("switch")
  .alias("use")
  .description("Switch active project")
  .argument("[projectId]", "Project ID")
  .action(async (projectIdArg?: string) => {
    const db = getGlobalDb();

    try {
      const projects = await queries.listProjects(db);

      if (projects.length === 0) {
        console.log(chalk.yellow("No projects found."));
        return;
      }

      let projectId: number;

      if (projectIdArg) {
        projectId = parseInt(projectIdArg, 10);
        if (Number.isNaN(projectId)) {
          console.error(chalk.red("Invalid project ID"));
          process.exit(1);
        }
      } else {
        // Interactive selection
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "projectId",
            message: "Select a project:",
            choices: projects.map((p) => ({
              name: `${p.name} ${p.isActive ? "(active)" : ""}`,
              value: p.id,
            })),
          },
        ]);
        projectId = answers.projectId;
      }

      // Check if project exists
      const project = await queries.getProjectById(db, projectId);
      if (!project) {
        console.error(chalk.red(`Project not found: ${projectId}`));
        process.exit(1);
      }

      // Set as active
      await queries.setActiveProject(db, projectId);

      console.log(
        chalk.green(`✓`),
        `Switched to project: ${chalk.bold(project.name)}`
      );
      console.log();
      console.log(chalk.gray("Path:"), project.path);
    } catch (error) {
      console.error(chalk.red("Failed to switch project"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Show current project
projectCommand
  .command("current")
  .description("Show current active project")
  .action(async () => {
    const db = getGlobalDb();

    try {
      const project = await queries.getActiveProject(db);

      if (!project) {
        console.log(chalk.yellow("No active project."));
        console.log();
        console.log(
          `Run ${chalk.cyan("ralph-looper init")} to create a new project.`
        );
        console.log(
          `Run ${chalk.cyan("ralph-looper project list")} to see all projects.`
        );
        return;
      }

      const stats = await queries.getProjectStats(db, project.id);

      console.log();
      console.log(chalk.bold("Project:"), project.name);
      console.log(chalk.gray("Path:"), project.path);
      if (project.description) {
        console.log(chalk.gray("Description:"), project.description);
      }
      console.log();
      console.log(chalk.bold("Progress:"));
      console.log(
        `  Sections: ${stats.sections.completed}/${stats.sections.total} completed`
      );
      console.log(
        `  Tasks:    ${stats.items.completed}/${stats.items.total} completed`
      );
      if (stats.items.skipped > 0) {
        console.log(`           ${stats.items.skipped} skipped`);
      }
      console.log();
      if (stats.iterations.total > 0) {
        console.log(chalk.bold("Iterations:"));
        console.log(`  Total:    ${stats.iterations.total}`);
        console.log(`  Completed: ${stats.iterations.completed}`);
        console.log();
      }
      if (stats.usage) {
        console.log(chalk.bold("Usage:"));
        console.log(
          `  Input tokens:  ${stats.usage.totalInputTokens.toLocaleString()}`
        );
        console.log(
          `  Output tokens: ${stats.usage.totalOutputTokens.toLocaleString()}`
        );
        if (stats.usage.totalCostUsd !== null) {
          console.log(
            `  Cost:          $${stats.usage.totalCostUsd.toFixed(2)}`
          );
        }
        console.log();
      }
    } catch (error) {
      console.error(chalk.red("Failed to get project info"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Remove project
projectCommand
  .command("remove")
  .alias("rm")
  .description("Remove a project")
  .argument("[projectId]", "Project ID")
  .option("-f, --force", "Force removal without confirmation")
  .action(async (projectIdArg?: string, options?: { force?: boolean }) => {
    const db = getGlobalDb();

    try {
      const projects = await queries.listProjects(db);

      if (projects.length === 0) {
        console.log(chalk.yellow("No projects found."));
        return;
      }

      let projectId: number;

      if (projectIdArg) {
        projectId = parseInt(projectIdArg, 10);
        if (Number.isNaN(projectId)) {
          console.error(chalk.red("Invalid project ID"));
          process.exit(1);
        }
      } else {
        // Interactive selection
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "projectId",
            message: "Select a project to remove:",
            choices: projects.map((p) => ({
              name: `${p.name} (ID: ${p.id})`,
              value: p.id,
            })),
          },
        ]);
        projectId = answers.projectId;
      }

      // Check if project exists
      const project = await queries.getProjectById(db, projectId);
      if (!project) {
        console.error(chalk.red(`Project not found: ${projectId}`));
        process.exit(1);
      }

      // Confirm deletion
      if (!options?.force) {
        const answers = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: `Are you sure you want to remove project "${project.name}"?`,
            default: false,
          },
        ]);

        if (!answers.confirm) {
          console.log(chalk.yellow("Cancelled"));
          return;
        }
      }

      // Delete project
      await queries.deleteProject(db, projectId);

      console.log(
        chalk.green(`✓`),
        `Removed project: ${chalk.bold(project.name)}`
      );
    } catch (error) {
      console.error(chalk.red("Failed to remove project"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
