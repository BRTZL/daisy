/**
 * Use Command
 * Switch to a different Daisy project
 */

import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { isDaemonRunning } from "../../daemon/launchd.js";
import { addKnownProject, setCurrentProject } from "../../storage/global.js";

const DEFAULT_PORT = 4141;

export const useCommand = new Command("use")
  .description("Switch to a different Daisy project")
  .argument("<path>", "Path to the project directory")
  .action(async (projectPath: string) => {
    // Resolve to absolute path
    const absolutePath = path.isAbsolute(projectPath)
      ? projectPath
      : path.resolve(process.cwd(), projectPath);

    // Check if directory exists
    if (!existsSync(absolutePath)) {
      console.log(chalk.red(`\n  Directory not found: ${absolutePath}\n`));
      process.exit(1);
    }

    // Check if .daisy directory exists
    const daisyDir = path.join(absolutePath, ".daisy");
    if (!existsSync(daisyDir)) {
      console.log(chalk.red(`\n  No Daisy project found at: ${absolutePath}`));
      console.log(chalk.gray(`  Run 'daisy init ${absolutePath}' first.\n`));
      process.exit(1);
    }

    const spinner = ora("Switching project...").start();

    // Always register in global storage
    addKnownProject(absolutePath);
    setCurrentProject(absolutePath);

    // If daemon is running, notify it via API
    if (isDaemonRunning()) {
      try {
        const response = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/projects/use`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: absolutePath }),
        });

        const data = (await response.json()) as {
          project: { name: string; path: string; stats: { total: number; pending: number } };
        };

        if (response.ok) {
          spinner.succeed(`Switched to: ${chalk.cyan(data.project.name)}`);
          console.log(chalk.gray(`  Path: ${data.project.path}`));
          console.log(chalk.gray(`  Tasks: ${data.project.stats.total} total, ${data.project.stats.pending} pending\n`));
          console.log(chalk.green(`  Open http://daisy.test:${DEFAULT_PORT} to view the project.\n`));
          return;
        }
      } catch {
        // Daemon not responding, but we've already saved locally
      }
    }

    // Fallback: just show local confirmation
    const projectName = path.basename(absolutePath);
    spinner.succeed(`Switched to: ${chalk.cyan(projectName)}`);
    console.log(chalk.gray(`  Path: ${absolutePath}\n`));

    if (!isDaemonRunning()) {
      console.log(chalk.yellow("  Daemon is not running. Run 'daisy start' to start it.\n"));
    }
  });
