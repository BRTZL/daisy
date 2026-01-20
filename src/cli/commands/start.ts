/**
 * Start Command
 * Starts the Daisy daemon
 */

import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import ora from "ora";
import {
  getDaemonStatus,
  isDaemonInstalled,
  isDaemonRunning,
  startDaemon,
} from "../../daemon/launchd.js";

const DEFAULT_PORT = 4141;
const url = `http://daisy.test:${DEFAULT_PORT}`;

export const startCommand = new Command("start")
  .description("Start the Daisy daemon")
  .option("--no-browser", "Don't open browser after starting")
  .action(async (options) => {
    // Check if installed
    if (!isDaemonInstalled()) {
      console.log(chalk.red("\n  Daisy is not installed."));
      console.log(chalk.gray("  Run 'daisy install' first.\n"));
      process.exit(1);
    }

    // Check if already running
    if (isDaemonRunning()) {
      const status = getDaemonStatus();
      console.log(
        chalk.green(`\n  Daisy is already running (PID: ${status.pid})`)
      );
      console.log(chalk.gray(`  Open ${url} to access the UI.\n`));

      if (options.browser !== false) {
        await open(url);
      }
      return;
    }

    // Start daemon
    const spinner = ora("Starting Daisy daemon...").start();
    try {
      startDaemon();
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Give it a moment

      const status = getDaemonStatus();
      if (status.running) {
        spinner.succeed(`Daisy started (PID: ${status.pid})`);
      } else {
        spinner.succeed("Daisy daemon started");
      }
    } catch (error) {
      spinner.fail("Failed to start daemon");
      console.error(chalk.red(`\n  ${(error as Error).message}\n`));
      process.exit(1);
    }

    console.log(chalk.gray(`\n  Access the UI at: ${url}\n`));

    // Open browser
    if (options.browser !== false) {
      try {
        await open(url);
      } catch {
        // Ignore browser open errors
      }
    }
  });
