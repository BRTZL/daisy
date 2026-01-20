import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI and MCP entries (with shebang)
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
      'mcp/index': 'src/mcp/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    shims: true,
    sourcemap: true,
    target: 'node18',
    banner: {
      js: '#!/usr/bin/env node'
    },
    treeshake: true,
    minify: process.env.NODE_ENV === 'production',
  },
  // Server and library entries (no shebang)
  {
    entry: {
      'server/index': 'src/server/index.ts',
      'index': 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false, // Don't clean again, CLI build already did
    shims: true,
    sourcemap: true,
    target: 'node18',
    treeshake: true,
    minify: process.env.NODE_ENV === 'production',
  },
]);
