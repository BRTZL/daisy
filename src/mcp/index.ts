/**
 * MCP Server Entry Point
 * Starts the Model Context Protocol server for Claude Code integration
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPServer } from "./server.js";

async function main() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Server is now running and waiting for requests
}

main().catch((error) => {
  // Write to stderr to avoid interfering with MCP protocol
  process.stderr.write("Failed to start MCP server:\n");
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
