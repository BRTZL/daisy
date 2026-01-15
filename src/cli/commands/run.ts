import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { LoopRunner } from "../../core/loop-runner.js";
import { createDatabase, getGlobalDb } from "../../db/index.js";
import * as queries from "../../db/queries.js";

export const runCommand = new Command("run");

runCommand
  .description("Start Ralph loop")
  .argument("[iterations]", "Number of iterations (default: 10)", "10")
  .option("-c, --continue", "Continue from last iteration")
  .option("-w, --watch", "Watch status.json for updates")
  .action(async (iterations: string, options) => {
    const maxIterations = parseInt(iterations, 10);
    if (Number.isNaN(maxIterations) || maxIterations < 1) {
      console.error(chalk.red("Invalid number of iterations"));
      process.exit(1);
    }

    const { continue: continueFlag, watch } = options;

    const db = getGlobalDb();

    // Get active project
    const project = await queries.getActiveProject(db);
    if (!project) {
      console.log(chalk.yellow("No active project."));
      console.log();
      console.log(
        `Run ${chalk.cyan("ralph-looper init")} to create a new project.`
      );
      console.log(
        `Run ${chalk.cyan("ralph-looper project switch")} to select a project.`
      );
      process.exit(1);
    }

    // Check if prompt exists
    const promptPath = path.join(project.path, ".ralph-looper", "PROMPT.md");
    if (!existsSync(promptPath)) {
      console.error(chalk.red(`Prompt file not found: ${promptPath}`));
      console.error(
        chalk.yellow("Run ralph-looper init to create a default prompt.")
      );
      process.exit(1);
    }

    // Get or create project in local database
    const { db: projectDb } = createDatabase(
      path.join(project.path, ".ralph-looper", "database.sqlite")
    );
    let localProject = await queries.getProjectByPath(projectDb, project.path);

    if (!localProject) {
      // Create project in local database
      localProject = await queries.createProject(projectDb, {
        name: project.name,
        path: project.path,
        config: project.config as Record<string, unknown>,
      });
    }

    console.log(
      chalk.blue(`Using project: ${project.name} (ID: ${localProject.id})`)
    );

    // Calculate starting iteration
    const iterationsList = await queries.getIterationsByProject(
      projectDb,
      localProject.id
    );
    let startingIteration = 1;

    if (iterationsList.length > 0) {
      const latestIteration = iterationsList[0];
      startingIteration = latestIteration.iterationNumber + 1;
    }

    // Implement --continue flag
    if (continueFlag && iterationsList.length > 0) {
      const latestIteration = iterationsList[0];
      if (latestIteration.status === "completed" && latestIteration.complete) {
        console.log(
          chalk.green("All tasks already completed! No need to continue.")
        );
        process.exit(0);
      }
      console.log(
        chalk.yellow(
          `Continuing from iteration ${startingIteration} (latest was ${latestIteration.iterationNumber})`
        )
      );
    } else {
      console.log(chalk.blue(`Starting from iteration ${startingIteration}`));
    }

    // Create loop runner
    const runner = new LoopRunner({
      projectPath: project.path,
      maxIterations,
      promptPath,
      startingIteration,
      onIterationStart: async (iterationNumber) => {
        // Create iteration record in database using local project ID
        await queries.createIteration(projectDb, {
          projectId: localProject.id,
          iterationNumber,
          status: "running",
        });
      },
      onIterationComplete: async (_iter, usage, complete) => {
        // Update iteration record
        const iterations = await queries.getIterationsByProject(
          projectDb,
          localProject.id
        );
        const latestIteration = iterations[0];

        if (latestIteration) {
          await queries.completeIteration(
            projectDb,
            latestIteration.id,
            usage,
            complete
          );
        }

        // Update aggregate usage
        await queries.updateUsage(projectDb, localProject.id, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreateTokens: usage.cacheCreateTokens,
          cacheReadTokens: usage.cacheReadTokens,
          costUsd: usage.costUsd,
        });
      },
      onStatusUpdate: async (status) => {
        // Get the current iteration
        const iterations = await queries.getIterationsByProject(
          projectDb,
          localProject.id
        );
        const currentIteration = iterations.find((i) => i.status === "running");

        if (currentIteration) {
          // Get section by external ID
          const section = await queries.getSectionByExternalId(
            projectDb,
            localProject.id,
            status.sectionId
          );

          // Create status snapshot
          await queries.createStatusSnapshot(projectDb, {
            iterationId: currentIteration.id,
            sectionId: section?.id || null,
            sectionName: status.sectionName,
            phase: status.phase,
            message: status.message,
            itemsTotal: status.itemsTotal,
            itemsCompleted: status.itemsCompleted,
          });
        }
      },
      onError: (error) => {
        console.error(chalk.red(`Error: ${error.message}`));
      },
    });

    // Set up signal handlers for graceful shutdown
    const shutdownHandler = async () => {
      console.log(chalk.yellow("\n\nStopping Ralph loop..."));
      runner.stop();

      // Give it time to clean up
      await new Promise((resolve) => setTimeout(resolve, 1000));
      process.exit(0);
    };

    process.on("SIGINT", shutdownHandler);
    process.on("SIGTERM", shutdownHandler);

    // Setup watch mode if requested
    let statusWatcher: ReturnType<typeof watch> | null = null;
    const statusPath = path.join(project.path, ".ralph-looper", "status.json");

    if (watch && existsSync(statusPath)) {
      console.log(chalk.cyan(`\nWatching status file: ${statusPath}`));
      statusWatcher = watch(statusPath, (eventType: "change" | "rename") => {
        if (eventType === "change") {
          try {
            const statusData = JSON.parse(readFileSync(statusPath, "utf-8"));
            const {
              sectionId,
              sectionName,
              phase,
              message,
              itemsTotal,
              itemsCompleted,
            } = statusData;
            const percentage =
              itemsTotal > 0
                ? Math.round((itemsCompleted / itemsTotal) * 100)
                : 0;

            console.log(chalk.cyan(`\n[Status Update]`));
            console.log(`  Section: ${sectionName} (ID: ${sectionId})`);
            console.log(`  Phase: ${phase}`);
            console.log(`  Message: ${message}`);
            console.log(
              `  Progress: ${itemsCompleted}/${itemsTotal} (${percentage}%)`
            );
            console.log();
          } catch (_err) {
            // Ignore parsing errors during file writes
          }
        }
      });
    }

    // Start the loop
    try {
      await runner.start();
    } catch (error) {
      console.error(chalk.red("Loop failed:"));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      // Cleanup watchers
      if (statusWatcher) {
        statusWatcher.close();
      }
      process.off("SIGINT", shutdownHandler);
      process.off("SIGTERM", shutdownHandler);
    }
  });
