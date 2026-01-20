/**
 * Uninstall Command
 * Removes Daisy daemon and /etc/hosts entry
 */

import { existsSync, rmSync } from "node:fs";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { hasDaisyHost, removeDaisyHost } from "../../daemon/hosts.js";
import {
  getLogsDir,
  isDaemonInstalled,
  uninstallDaemon,
} from "../../daemon/launchd.js";

export const uninstallCommand = new Command("uninstall")
  .description("Remove Daisy daemon and daisy.test domain")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--keep-logs", "Keep log files")
  .action(async (options) => {
    console.log(chalk.cyan("\n  Daisy Uninstallation\n"));

    // Check if anything is installed
    const daemonInstalled = isDaemonInstalled();
    const hostConfigured = hasDaisyHost();

    if (!daemonInstalled && !hostConfigured) {
      console.log(chalk.yellow("  Daisy is not installed.\n"));
      return;
    }

    // Confirm uninstall
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Are you sure you want to uninstall Daisy?",
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray("\n  Uninstall cancelled.\n"));
        return;
      }
    }

    // Step 1: Stop and remove daemon
    if (daemonInstalled) {
      const daemonSpinner = ora("Removing Daisy daemon...").start();
      try {
        uninstallDaemon();
        daemonSpinner.succeed("Removed Daisy daemon");
      } catch (error) {
        daemonSpinner.fail("Failed to remove daemon");
        console.error(chalk.red(`\n  ${(error as Error).message}`));
      }
    }

    // Step 2: Remove /etc/hosts entry
    if (hostConfigured) {
      const hostsSpinner = ora(
        "Removing daisy.test from /etc/hosts..."
      ).start();
      console.log(
        chalk.yellow(
          "\n  Removing daisy.test from /etc/hosts requires sudo access."
        )
      );

      const result = removeDaisyHost();
      if (!result.success) {
        hostsSpinner.fail("Failed to remove /etc/hosts entry");
        console.error(chalk.red(`\n  ${result.error}`));
        console.log(chalk.yellow("\n  You may need to remove it manually:"));
        console.log(chalk.gray("  sudo nano /etc/hosts\n"));
      } else {
        hostsSpinner.succeed("Removed daisy.test from /etc/hosts");
      }
    }

    // Step 3: Optionally remove logs
    const logsDir = getLogsDir();
    if (!options.keepLogs && existsSync(logsDir)) {
      const logsSpinner = ora("Removing log files...").start();
      try {
        rmSync(logsDir, { recursive: true, force: true });
        logsSpinner.succeed("Removed log files");
      } catch {
        logsSpinner.warn("Could not remove log files");
      }
    }

    console.log(chalk.green("\n  Daisy uninstalled successfully!\n"));
    console.log(chalk.gray("  To reinstall, run: daisy install\n"));
  });
