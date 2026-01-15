import { existsSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getGlobalDb } from "../../db/index.js";
import * as queries from "../../db/queries.js";

export const statusCommand = new Command("status");

statusCommand
  .description("Show current loop status")
  .option("-j, --json", "Output as JSON")
  .action(async (options) => {
    const db = getGlobalDb();

    try {
      // Get active project
      const project = await queries.getActiveProject(db);

      if (!project) {
        console.log(chalk.yellow("No active project."));
        console.log();
        console.log(
          `Run ${chalk.cyan("ralph-looper init")} to create a new project.`
        );
        return;
      }

      // Check for status.json
      const statusPath = path.join(
        project.path,
        ".ralph-looper",
        "status.json"
      );

      if (!existsSync(statusPath)) {
        console.log(chalk.yellow("No status file found."));
        console.log();
        console.log(chalk.gray("The Ralph loop has not been started yet."));
        console.log();
        console.log(`Run ${chalk.cyan("ralph-looper run")} to start the loop.`);
        return;
      }

      // Read status.json
      const statusData = JSON.parse(
        require("node:fs").readFileSync(statusPath, "utf-8")
      );

      if (options.json) {
        console.log(JSON.stringify(statusData, null, 2));
        return;
      }

      // Display status
      console.log();
      console.log(chalk.bold("Current Status:"));
      console.log();
      console.log(chalk.gray("Section:"), statusData.sectionName || "N/A");
      console.log(chalk.gray("Phase:"), getPhaseLabel(statusData.phase));
      console.log(chalk.gray("Message:"), statusData.message);
      console.log();

      // Progress bar
      const progress =
        statusData.itemsTotal > 0
          ? (statusData.itemsCompleted / statusData.itemsTotal) * 100
          : 0;
      const progressBar = getProgressBar(progress);
      console.log(chalk.gray("Progress:"));
      console.log(
        `  ${progressBar} ${statusData.itemsCompleted}/${statusData.itemsTotal} (${Math.round(progress)}%)`
      );
      console.log();

      // Get latest iteration info
      const { createDatabase } = await import("../../db/index.js");
      const { db: projectDb } = createDatabase(
        path.join(project.path, ".ralph-looper", "database.sqlite")
      );
      const latestIteration = await queries.getLatestIteration(
        projectDb,
        project.id
      );

      if (latestIteration) {
        console.log(chalk.bold("Latest Iteration:"));
        console.log(
          `  #${latestIteration.iterationNumber} ${chalk.gray(`(${latestIteration.status})`)}`
        );
        console.log(
          `  Started: ${new Date(latestIteration.startedAt).toLocaleString()}`
        );

        if (latestIteration.status === "completed") {
          const completedAt = latestIteration.completedAt;
          if (completedAt) {
            console.log(
              `  Completed: ${new Date(completedAt).toLocaleString()}`
            );
          }
          console.log();
          console.log(chalk.gray("Tokens:"));
          console.log(
            `    Input:  ${latestIteration.inputTokens.toLocaleString()}`
          );
          console.log(
            `    Output: ${latestIteration.outputTokens.toLocaleString()}`
          );
          if (latestIteration.costUsd !== null) {
            console.log(`    Cost:   $${latestIteration.costUsd.toFixed(2)}`);
          }
        }
        console.log();
      }
    } catch (error) {
      console.error(chalk.red("Failed to get status"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "selecting":
      return chalk.blue("Selecting");
    case "implementing":
      return chalk.yellow("Implementing");
    case "testing":
      return chalk.magenta("Testing");
    case "committing":
      return chalk.cyan("Committing");
    case "done":
      return chalk.green("Done");
    default:
      return phase;
  }
}

function getProgressBar(progress: number): string {
  const width = 30;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  let bar = "";
  for (let i = 0; i < filled; i++) {
    bar += "█";
  }
  for (let i = 0; i < empty; i++) {
    bar += "░";
  }

  return chalk.green(bar);
}
