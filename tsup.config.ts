import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/cli/index.ts',
    'src/mcp/index.ts',
    'src/index.ts'
  ],
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
});
