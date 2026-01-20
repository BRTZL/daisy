import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { openCommand } from "./commands/open.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { useCommand } from "./commands/use.js";

const program = new Command();

program
  .name("daisy")
  .description("Daisy - AI-powered task planning and execution for Claude Code")
  .version("2.1.0");

// Init command (initialize a project with .daisy folder)
program.addCommand(initCommand);

// Install command (install daemon + configure hosts)
program.addCommand(installCommand);

// Uninstall command (remove daemon + hosts entry)
program.addCommand(uninstallCommand);

// Start command (start daemon)
program.addCommand(startCommand);

// Stop command (stop daemon)
program.addCommand(stopCommand);

// Open command (open browser to daisy.test)
program.addCommand(openCommand);

// Use command (switch to a project)
program.addCommand(useCommand);

// MCP server command (kept for Claude Code integration)
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
