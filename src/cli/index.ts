import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { projectCommand } from "./commands/project.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { tasksCommand } from "./commands/tasks.js";

const program = new Command();

program
  .name("ralph-looper")
  .description(
    "Ralph Loop manager for continuous AI development with Claude Code"
  )
  .version("1.0.0");

// Init command
program.addCommand(initCommand);

// Project management
program.addCommand(projectCommand);

// Tasks command
program.addCommand(tasksCommand);

// Status command
program.addCommand(statusCommand);

// Run command
program.addCommand(runCommand);

// MCP server command
program
  .command("mcp")
  .description("Start MCP server for Claude Code integration (stdio mode)")
  .action(async () => {
    // Import and start MCP server
    const { createMCPServer } = await import("../mcp/server.js");
    const { StdioServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );

    const server = createMCPServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);

    // Keep process alive
    process.on("SIGINT", () => {
      process.stderr.write("\nShutting down MCP server...\n");
      process.exit(0);
    });
  });

// Parse arguments
program.parse();
