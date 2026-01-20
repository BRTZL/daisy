/**
 * Open Command
 * Opens Daisy web UI in the browser
 */

import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { getDaemonStatus, isDaemonRunning } from "../../daemon/launchd.js";

const DEFAULT_PORT = 4141;
const url = `http://daisy.test:${DEFAULT_PORT}`;

export const openCommand = new Command("open")
  .description("Open Daisy web UI in browser")
  .action(async () => {
    // Check if daemon is running
    if (!isDaemonRunning()) {
      console.log(chalk.yellow("\n  Daisy daemon is not running."));
      console.log(chalk.gray("  Run 'daisy start' to start it.\n"));
      process.exit(1);
    }

    const status = getDaemonStatus();
    console.log(chalk.green(`\n  Daisy is running (PID: ${status.pid})`));
    console.log(chalk.gray(`  Opening ${url}...\n`));

    try {
      await open(url);
    } catch {
      console.error(chalk.red("  Could not open browser automatically."));
      console.log(chalk.gray(`  Please open ${url} manually.\n`));
    }
  });
