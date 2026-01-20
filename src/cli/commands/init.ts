import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { addKnownProject, setCurrentProject } from "../../storage/global.js";
import {
  ensureProjectDir,
  isProject,
  saveConfig,
  saveTasks,
} from "../../storage/project.js";
import type { ProjectConfig, Task } from "../../storage/types.js";

// Legacy format types for migration
interface LegacySection {
  id?: number | string;
  name?: string;
  title?: string;
  description?: string;
  status?: string;
  items?: LegacyItem[];
}

interface LegacyItem {
  text?: string;
  title?: string;
  note?: string;
  description?: string;
  status?: string;
}

interface LegacyTaskData {
  sections?: LegacySection[];
}

interface LegacyTask {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  tasks?: LegacyTask[];
}

export const initCommand = new Command("init");

initCommand
  .description("Initialize a new daisy project")
  .argument("[path]", "Project path (default: current directory)", ".")
  .option("-n, --name <name>", "Project name")
  .option("-p, --prompt <path>", "Path to custom PROMPT.md")
  .action(async (projectPath: string, options) => action(projectPath, options));

async function action(
  projectPath: string,
  options: { name?: string; prompt?: string }
) {
  const spinner = ora("Initializing daisy project...").start();

  try {
    // Resolve absolute path
    const absolutePath = path.resolve(projectPath);

    // Check if directory exists
    if (!existsSync(absolutePath)) {
      spinner.fail(`Path does not exist: ${absolutePath}`);
      process.exit(1);
    }

    // Check if this is a re-initialization
    const isReinit = isProject(absolutePath);

    // Get project name
    const projectName = options.name || path.basename(absolutePath);

    // Define all paths upfront
    const configPath = path.join(absolutePath, ".daisy", "config.json");
    const tasksPath = path.join(absolutePath, ".daisy", "tasks.json");
    const promptPath = path.join(absolutePath, ".daisy", "PROMPT.md");
    const plansDir = path.join(absolutePath, ".daisy", "plans");
    const claudeDir = path.join(absolutePath, ".claude");
    const claudeSettingsPath = path.join(claudeDir, "settings.json");
    const mcpConfigPath = path.join(absolutePath, ".mcp.json");

    // Track what actions to take
    let writeConfig = true;
    let writeTasks = true;
    let writePrompt = true;
    let writeClaudeSettings = true;
    let mcpAction: "create" | "keep" | "merge" | "overwrite" = "create";

    // If re-initializing, prompt for each existing file
    if (isReinit) {
      spinner.stop();
      console.log(chalk.yellow("Found existing daisy project."));
      console.log();

      // Check each file and prompt if it exists
      if (existsSync(configPath)) {
        const action = await promptForFile(".daisy/config.json", [
          "keep",
          "overwrite",
        ]);
        writeConfig = action === "overwrite";
      }

      if (existsSync(tasksPath)) {
        const action = await promptForFile(".daisy/tasks.json", [
          "keep",
          "overwrite",
        ]);
        writeTasks = action === "overwrite";
      }

      if (existsSync(promptPath) && !options.prompt) {
        const action = await promptForFile(".daisy/PROMPT.md", [
          "keep",
          "overwrite",
        ]);
        writePrompt = action === "overwrite";
      }

      if (existsSync(claudeSettingsPath)) {
        const action = await promptForFile(".claude/settings.json", [
          "keep",
          "overwrite",
        ]);
        writeClaudeSettings = action === "overwrite";
      }

      if (existsSync(mcpConfigPath)) {
        mcpAction = await promptForFile(".mcp.json", [
          "keep",
          "merge",
          "overwrite",
        ]);
      }

      console.log();
      spinner.start("Updating project...");
    }

    // Create .daisy directory
    spinner.text = "Creating project structure...";
    ensureProjectDir(absolutePath);

    // Create plans directory
    if (!existsSync(plansDir)) {
      mkdirSync(plansDir, { recursive: true });
    }

    // Create or update config
    if (writeConfig) {
      const config: ProjectConfig = {
        loop: {
          maxIterations: 10,
          maxAttemptsPerTask: 3,
        },
      };
      saveConfig(absolutePath, config);
    }

    // Initialize tasks
    let importedTasks = false;
    if (writeTasks) {
      const tasksJsonPath = path.join(absolutePath, "tasks.json");

      if (existsSync(tasksJsonPath)) {
        spinner.text = "Importing tasks.json...";
        try {
          const content = readFileSync(tasksJsonPath, "utf-8");
          const parsedTasks = JSON.parse(content);
          const tasks = convertLegacyTasks(parsedTasks);
          saveTasks(absolutePath, tasks);
          importedTasks = true;
        } catch (_e) {
          spinner.warn(
            "Could not import tasks.json, starting with empty tasks"
          );
          saveTasks(absolutePath, []);
        }
      } else {
        saveTasks(absolutePath, []);
      }
    }

    // Copy PROMPT.md if provided or use default
    if (options.prompt) {
      if (!existsSync(options.prompt)) {
        spinner.fail(`Prompt file not found: ${options.prompt}`);
        process.exit(1);
      }
      copyFileSync(options.prompt, promptPath);
    } else if (writePrompt) {
      writeFileSync(promptPath, getDefaultPrompt());
    }

    // Create .claude/settings.json for Claude Code permissions
    if (writeClaudeSettings) {
      spinner.text = "Configuring Claude Code permissions...";

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      const claudeSettings = getDefaultClaudeSettings();
      writeFileSync(
        claudeSettingsPath,
        JSON.stringify(claudeSettings, null, 2)
      );
    }

    // Handle .mcp.json based on action
    spinner.text = "Configuring MCP server...";

    if (mcpAction === "create" || mcpAction === "overwrite") {
      const mcpConfig = {
        mcpServers: {
          daisy: {
            command: "daisy",
            args: ["mcp"],
          },
        },
      };
      writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    } else if (mcpAction === "merge") {
      mergeMcpConfig(mcpConfigPath);
    }
    // mcpAction === "keep" does nothing

    // Register project in global storage
    addKnownProject(absolutePath);
    setCurrentProject(absolutePath);

    spinner.succeed(
      isReinit
        ? `Updated daisy project: ${chalk.bold(projectName)}`
        : `Initialized daisy project: ${chalk.bold(projectName)}`
    );
    console.log();
    console.log(chalk.gray("Project directory:"), absolutePath);
    console.log();
    if (importedTasks) {
      console.log(chalk.green("✓"), "Imported tasks from tasks.json");
    }
    console.log(chalk.green("✓"), "Created .daisy directory");
    console.log(chalk.green("✓"), "Created .daisy/plans directory");
    console.log(
      writeConfig ? chalk.green("✓") : chalk.yellow("○"),
      writeConfig ? "Created config.json" : "Kept existing config.json"
    );
    console.log(
      writeTasks ? chalk.green("✓") : chalk.yellow("○"),
      writeTasks ? "Created tasks.json" : "Kept existing tasks.json"
    );
    console.log(
      writePrompt ? chalk.green("✓") : chalk.yellow("○"),
      writePrompt ? "Created PROMPT.md template" : "Kept existing PROMPT.md"
    );
    console.log(
      writeClaudeSettings ? chalk.green("✓") : chalk.yellow("○"),
      writeClaudeSettings
        ? "Created .claude/settings.json (permissions)"
        : "Kept existing .claude/settings.json"
    );
    const mcpMessage =
      mcpAction === "merge"
        ? "Merged daisy server into .mcp.json"
        : mcpAction === "keep"
          ? "Kept existing .mcp.json"
          : "Created .mcp.json (MCP server config)";
    console.log(
      mcpAction === "keep" ? chalk.yellow("○") : chalk.green("✓"),
      mcpMessage
    );
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(
      `  ${chalk.cyan("daisy plan")}       - Start interactive planning with Claude`
    );
    console.log(`  ${chalk.cyan("daisy tasks")}      - List all tasks`);
    console.log(
      `  ${chalk.cyan("daisy run 10")}     - Start task-based loop (10 iterations)`
    );
    console.log(
      `  ${chalk.cyan("daisy loop")}       - Start open-ended loop (no tasks)`
    );
    console.log();

    // Show shell completions setup
    const shell = process.env.SHELL || "";
    const shellName = path.basename(shell);
    if (shellName === "zsh" || shellName === "bash" || shellName === "fish") {
      console.log(chalk.bold("Shell completions:"));
      if (shellName === "zsh") {
        console.log(
          `  Add to ~/.zshrc: ${chalk.cyan('eval "$(daisy completions zsh)"')}`
        );
      } else if (shellName === "bash") {
        console.log(
          `  Add to ~/.bashrc: ${chalk.cyan('eval "$(daisy completions bash)"')}`
        );
      } else if (shellName === "fish") {
        console.log(
          `  Run: ${chalk.cyan("daisy completions fish > ~/.config/fish/completions/daisy.fish")}`
        );
      }
      console.log();
    }
  } catch (error) {
    spinner.fail("Failed to initialize project");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

/**
 * Convert legacy tasks.json format (sections/items) to new format (recursive tasks)
 */
function convertLegacyTasks(data: unknown): Task[] {
  // If it's already an array, check if it's new or old format
  if (Array.isArray(data)) {
    // Check if it looks like old format (has sections with items)
    const firstItem = data[0] as LegacySection | undefined;
    if (
      data.length > 0 &&
      firstItem &&
      "items" in firstItem &&
      Array.isArray(firstItem.items)
    ) {
      // Old format: sections with items
      return (data as LegacySection[]).map(
        (section: LegacySection, sectionIndex: number) => ({
          id: section.id?.toString() || `section-${sectionIndex + 1}`,
          title: section.name || section.title || `Section ${sectionIndex + 1}`,
          description: section.description,
          status: mapLegacyStatus(section.status),
          tasks: (section.items || []).map(
            (item: LegacyItem, itemIndex: number) => ({
              id: `${section.id || sectionIndex + 1}-${itemIndex + 1}`,
              title: item.text || item.title || `Item ${itemIndex + 1}`,
              description: item.note || item.description,
              status: mapLegacyStatus(item.status),
            })
          ),
        })
      );
    }

    // New format or simple array - return as-is with defaults
    return (data as LegacyTask[]).map((task: LegacyTask, index: number) =>
      normalizeTask(task, index)
    );
  }

  // If it's an object with sections
  if (data && typeof data === "object" && "sections" in data) {
    return convertLegacyTasks((data as LegacyTaskData).sections);
  }

  return [];
}

/**
 * Map legacy status values to new ones
 */
function mapLegacyStatus(status: string | undefined): Task["status"] {
  switch (status) {
    case "passed":
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    case "partial":
    case "in_progress":
      return "in_progress";
    case "blocked":
      return "blocked";
    default:
      return "pending";
  }
}

/**
 * Normalize a task object with defaults
 */
function normalizeTask(task: LegacyTask, index: number): Task {
  return {
    id: task.id || `task-${index + 1}`,
    title: task.title || task.name || `Task ${index + 1}`,
    description: task.description,
    status: mapLegacyStatus(task.status),
    dependsOn: task.dependsOn,
    acceptanceCriteria: task.acceptanceCriteria,
    tasks: task.tasks?.map((t: LegacyTask, i: number) => normalizeTask(t, i)),
  };
}

/**
 * Default Claude Code settings for daisy automation
 */
function getDefaultClaudeSettings(): object {
  return {
    permissions: {
      allow: [
        "Skill(frontend-design:frontend-design)",
        "mcp__daisy",
        "mcp__chrome-devtools",
        // File operations
        "Read",
        "Write",
        "Edit",
        // Search operations
        "Glob",
        "Grep",
        // Shell commands (with project scope)
        "Bash(git:*)",
        "Bash(npm:*)",
        "Bash(npx:*)",
        "Bash(node:*)",
        "Bash(bun:*)",
        "Bash(pnpm:*)",
        "Bash(yarn:*)",
        "Bash(make:*)",
        "Bash(cargo:*)",
        "Bash(go:*)",
        "Bash(python:*)",
        "Bash(pip:*)",
        "Bash(pytest:*)",
        "Bash(vitest:*)",
        "Bash(jest:*)",
        "Bash(tsc:*)",
        "Bash(eslint:*)",
        "Bash(prettier:*)",
        "Bash(biome:*)",
        // Task management
        "TodoWrite",
        // Web fetching for documentation
        "WebFetch",
      ],
      deny: [],
    },
  };
}

function getDefaultPrompt(): string {
  return `# Project Instructions

<!--
  This is your base prompt for Daisy loops.

  - For "daisy run": Tasks are managed automatically via MCP tools
  - For "daisy loop": Open-ended development with activity log for continuity

  Customize this file with your project-specific instructions.
-->

## Project Overview

Describe your project here. What are you building? What technologies are you using?

## Goals

What should be accomplished? List the main objectives.

## Guidelines

- Follow existing code patterns and conventions
- Write clean, maintainable code
- Test changes before marking complete
- Document any important decisions

## Technical Notes

Add any technical context, constraints, or preferences here.
`;
}

/**
 * Prompt user for action on existing file
 */
async function promptForFile(
  displayName: string,
  options: ("keep" | "overwrite" | "merge")[]
): Promise<"keep" | "overwrite" | "merge"> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: `What would you like to do with ${chalk.cyan(displayName)}?`,
      choices: options.map((opt) => ({
        name:
          opt === "keep"
            ? "Keep existing"
            : opt === "merge"
              ? "Merge (add daisy server to existing config)"
              : "Overwrite with defaults",
        value: opt,
      })),
    },
  ]);
  return action;
}

/**
 * Merge daisy MCP server into existing .mcp.json
 */
function mergeMcpConfig(mcpConfigPath: string): void {
  const content = readFileSync(mcpConfigPath, "utf-8");
  const existing = JSON.parse(content) as Record<string, unknown>;

  if (!existing.mcpServers) {
    existing.mcpServers = {};
  }

  (existing.mcpServers as Record<string, unknown>).daisy = {
    command: "daisy",
    args: ["mcp"],
  };

  writeFileSync(mcpConfigPath, JSON.stringify(existing, null, 2));
}
