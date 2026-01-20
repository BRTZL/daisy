/**
 * Install Command
 * Sets up Daisy daemon (launchd) and configures /etc/hosts
 */

import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import ora from "ora";
import { addDaisyHost, hasDaisyHost } from "../../daemon/hosts.js";
import {
  getDaemonStatus,
  getServerPath,
  installDaemon,
  isDaemonInstalled,
} from "../../daemon/launchd.js";

const DEFAULT_PORT = 4141;

export const installCommand = new Command("install")
  .description("Install Daisy daemon and configure daisy.test domain")
  .option("--no-browser", "Don't open browser after installation")
  .option("--port <port>", "Port to run the daemon on", String(DEFAULT_PORT))
  .action(async (options) => {
    console.log(chalk.cyan("\n  Daisy Installation\n"));

    const port = parseInt(options.port, 10);
    const url = `http://daisy.test:${port}`;

    // Check if already installed
    if (isDaemonInstalled() && hasDaisyHost()) {
      const status = getDaemonStatus();
      if (status.running) {
        console.log(chalk.green("  Daisy is already installed and running!"));
        console.log(chalk.gray(`  Open ${url} to access the UI.\n`));

        if (options.browser !== false) {
          await open(url);
        }
        return;
      }
    }

    // Step 1: Find server path
    const spinner = ora("Locating Daisy server...").start();
    let serverPath: string;
    try {
      serverPath = getServerPath();
      spinner.succeed(`Found server at ${chalk.gray(serverPath)}`);
    } catch (error) {
      spinner.fail("Could not locate Daisy server");
      console.error(chalk.red(`\n  ${(error as Error).message}`));
      console.log(chalk.yellow("\n  Make sure Daisy is installed globally:"));
      console.log(chalk.gray("  npm install -g daisy\n"));
      process.exit(1);
    }

    // Step 2: Configure /etc/hosts
    const hostsSpinner = ora("Configuring daisy.test domain...").start();
    if (hasDaisyHost()) {
      hostsSpinner.succeed("Domain daisy.test already configured");
    } else {
      console.log(
        chalk.yellow(
          "\n  Adding daisy.test to /etc/hosts requires sudo access."
        )
      );

      const result = addDaisyHost();
      if (!result.success) {
        hostsSpinner.fail("Failed to configure /etc/hosts");
        console.error(chalk.red(`\n  ${result.error}`));
        console.log(chalk.yellow("\n  Try running manually:"));
        console.log(
          chalk.gray(
            '  echo "127.0.0.1\\tdaisy.test" | sudo tee -a /etc/hosts\n'
          )
        );
        process.exit(1);
      }
      hostsSpinner.succeed("Added daisy.test to /etc/hosts");
    }

    // Step 3: Install daemon
    const daemonSpinner = ora("Installing Daisy daemon...").start();

    try {
      if (isDaemonInstalled()) {
        daemonSpinner.succeed("Daemon already installed");
      } else {
        installDaemon(serverPath, port);
        daemonSpinner.succeed("Installed and started Daisy daemon");
      }
    } catch (error) {
      daemonSpinner.fail("Failed to install daemon");
      console.error(chalk.red(`\n  ${(error as Error).message}`));
      process.exit(1);
    }

    // Step 4: Verify daemon is running
    const verifySpinner = ora("Verifying daemon is running...").start();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Give it a moment to start

    const status = getDaemonStatus();
    if (status.running) {
      verifySpinner.succeed(`Daemon running (PID: ${status.pid})`);
    } else {
      verifySpinner.warn("Daemon installed but may not be running yet");
      console.log(chalk.gray("  Run 'daisy start' to start it manually."));
    }

    // Success message
    console.log(chalk.green("\n  Daisy installed successfully!\n"));
    console.log(chalk.white("  Access the UI at:"));
    console.log(chalk.cyan(`  ${url}\n`));
    console.log(chalk.gray("  Commands:"));
    console.log(chalk.gray("    daisy start      - Start the daemon"));
    console.log(chalk.gray("    daisy stop       - Stop the daemon"));
    console.log(chalk.gray("    daisy open       - Open UI in browser"));
    console.log(chalk.gray("    daisy uninstall  - Remove Daisy daemon\n"));

    // Open browser
    if (options.browser !== false) {
      const browserSpinner = ora("Opening browser...").start();
      try {
        await open(url);
        browserSpinner.succeed("Opened browser");
      } catch {
        browserSpinner.warn("Could not open browser automatically");
      }
    }
  });
