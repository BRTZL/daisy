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
import ora from "ora";
import {
  createDatabase,
  getGlobalDb,
  getGlobalDbPath,
  getProjectDbPath,
} from "../../db/index.js";
import * as queries from "../../db/queries.js";
import { importTasksFromJSON } from "../../db/queries.js";

export const initCommand = new Command("init");

initCommand
  .description("Initialize a new ralph-looper project")
  .argument("[path]", "Project path (default: current directory)", ".")
  .option("-n, --name <name>", "Project name")
  .option("-p, --prompt <path>", "Path to custom PROMPT.md")
  .action(async (projectPath: string, options) => action(projectPath, options));

async function action(
  projectPath: string,
  options: { name?: string; prompt?: string }
) {
  const spinner = ora("Initializing ralph-looper project...").start();

  try {
    // Resolve absolute path
    const absolutePath = path.resolve(projectPath);

    // Check if directory exists
    if (!existsSync(absolutePath)) {
      spinner.fail(`Path does not exist: ${absolutePath}`);
      process.exit(1);
    }

    // Get global database
    const db = getGlobalDb();

    // Run migrations to ensure tables exist in both databases
    spinner.text = "Setting up databases...";

    // Create tables in global database first
    const globalDbPath = getGlobalDbPath();
    const globalDir = path.dirname(globalDbPath);
    if (!existsSync(globalDir)) {
      mkdirSync(globalDir, { recursive: true });
    }

    const { sqlite: globalSqlite } = createDatabase(globalDbPath);
    const { ensureTables } = await import("../../db/index.js");
    ensureTables(globalSqlite);

    // Create tables in project-local database
    const projectDbPath = getProjectDbPath(absolutePath);
    const { sqlite: projectSqlite } = createDatabase(projectDbPath);
    ensureTables(projectSqlite);

    // Check if project already exists
    const existingProject = await queries.getProjectByPath(db, absolutePath);
    if (existingProject) {
      spinner.fail(`Project already initialized at ${absolutePath}`);
      console.log(
        chalk.yellow("Run ") +
          chalk.bold("ralph-looper project switch") +
          chalk.yellow(" to switch to this project")
      );
      process.exit(1);
    }

    // Create .ralph-looper directory
    const ralphDir = path.join(absolutePath, ".ralph-looper");
    if (!existsSync(ralphDir)) {
      mkdirSync(ralphDir, { recursive: true });
    }

    // Get project name
    const projectName = options.name || path.basename(absolutePath);

    // Create project in global database FIRST
    const project = await queries.createProject(db, {
      name: projectName,
      path: absolutePath,
      config: {},
    });

    // Set as active project
    await queries.setActiveProject(db, project.id);

    // Create project database
    const { db: projectDb } = createDatabase(
      path.join(ralphDir, "database.sqlite")
    );

    // Create project entry in project-local database (for foreign key constraints)
    await queries.createProject(projectDb, {
      name: projectName,
      path: absolutePath,
      config: {},
    });

    // Import tasks.json if it exists (use id 1 since it's the first project in local DB)
    const tasksPath = path.join(absolutePath, "tasks.json");
    let hasTasks = false;
    if (existsSync(tasksPath)) {
      spinner.text = "Importing tasks.json...";
      const tasksData = JSON.parse(readFileSync(tasksPath, "utf-8") as string);
      await importTasksFromJSON(projectDb, 1, tasksData);
      hasTasks = true;
    }

    // Copy PROMPT.md if provided or use default
    if (options.prompt) {
      if (!existsSync(options.prompt)) {
        spinner.fail(`Prompt file not found: ${options.prompt}`);
        process.exit(1);
      }
      copyFileSync(options.prompt, path.join(ralphDir, "PROMPT.md"));
    } else if (!existsSync(path.join(ralphDir, "PROMPT.md"))) {
      // Create default PROMPT.md
      const defaultPrompt = getDefaultPrompt();
      writeFileSync(path.join(ralphDir, "PROMPT.md"), defaultPrompt);
    }

    spinner.succeed(
      `Initialized ralph-looper project: ${chalk.bold(projectName)}`
    );
    console.log();
    console.log(chalk.gray("Project directory:"), absolutePath);
    console.log(chalk.gray("Project ID:"), project.id);
    console.log();
    if (hasTasks) {
      console.log(chalk.green("✓"), "Imported tasks from tasks.json");
    }
    console.log(chalk.green("✓"), "Created .ralph-looper directory");
    console.log(chalk.green("✓"), "Created PROMPT.md template");
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(
      `  ${chalk.cyan("ralph-looper tasks")}              - List all tasks`
    );
    console.log(
      `  ${chalk.cyan("ralph-looper run 10")}              - Start Ralph loop (10 iterations)`
    );
    console.log(
      `  ${chalk.cyan("ralph-looper project list")}       - List all projects`
    );
    console.log();
  } catch (error) {
    spinner.fail("Failed to initialize project");
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

function getDefaultPrompt(): string {
  return `@tasks.json @.ralph-looper/activity.md

## Status Updates

Write status updates to \`.ralph-looper/status.json\` so the user can track progress in the terminal:

\`\`\`json
{
  "sectionId": 1,
  "sectionName": "Authentication",
  "phase": "selecting|implementing|testing|committing|done",
  "message": "Brief status message",
  "itemsTotal": 7,
  "itemsCompleted": 0
}
\`\`\`

Update this file at these key points:

1. **When selecting a section**: \`{"sectionId": 1, "sectionName": "...", "phase": "selecting", "message": "Reading tasks.json..."}\`
2. **When implementing**: \`{"phase": "implementing", "message": "Working on item 3/7..."}\`
3. **When testing**: \`{"phase": "testing", "message": "Testing feature..."}\`
4. **When committing**: \`{"phase": "committing", "message": "Creating commit..."}\`
5. **When done**: \`{"phase": "done", "message": "Section complete"}\`

Use \`echo '{...}' > .ralph-looper/status.json\` via Bash tool.

## Section Selection

Open \`.ralph-looper/tasks.json\` and find the **first section with status: "pending"**.

Work through ALL items in that section before moving to the next section.

## Implementation

For each section, work through ALL its items:

1. Read relevant code files to understand current implementation
2. For each item in the section:
   - Implement the change or verify the feature works
   - Test your changes
   - Update the item's status in tasks.json
3. After ALL items pass, update the section's status to "completed"

## Updating tasks.json

After testing each item:

- Change \`"status": "pending"\` to \`"status": "passed"\` if it works
- Change \`"status": "pending"\` to \`"status": "skipped"\` if blocked (document why)

After ALL items in a section are tested:

- Change the section's \`"status": "pending"\` to \`"status": "completed"\`

Use the Edit tool to update the JSON file.

## Reporting

After completing a section, append a dated progress entry to activity.md:

\`\`\`markdown
### [Date] - Section [ID]: [Section Name]

- **Items**: X/Y passed, Z skipped
- **Changes**: List of code changes made (if any)
- **Testing**: Summary of testing performed
- **Status**: COMPLETED / PARTIAL (with reason)
\`\`\`

## Git Commit

**Only commit if you made code changes.** If you only verified existing features, skip the commit.
`;
}
