/**
 * Stop Command
 * Stops the Daisy daemon
 */

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import {
  isDaemonInstalled,
  isDaemonRunning,
  stopDaemon,
} from "../../daemon/launchd.js";

export const stopCommand = new Command("stop")
  .description("Stop the Daisy daemon")
  .action(async () => {
    // Check if installed
    if (!isDaemonInstalled()) {
      console.log(chalk.yellow("\n  Daisy is not installed.\n"));
      return;
    }

    // Check if running
    if (!isDaemonRunning()) {
      console.log(chalk.yellow("\n  Daisy daemon is not running.\n"));
      return;
    }

    // Stop daemon
    const spinner = ora("Stopping Daisy daemon...").start();
    try {
      stopDaemon();
      spinner.succeed("Daisy daemon stopped");
    } catch (error) {
      spinner.fail("Failed to stop daemon");
      console.error(chalk.red(`\n  ${(error as Error).message}\n`));
      process.exit(1);
    }

    console.log(chalk.gray("\n  Run 'daisy start' to start it again.\n"));
  });
