
import type { Config } from 'drizzle-kit';

export default {
  schema: '/Users/bartuozel/Documents/workspace/ralph-looper/src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: '/Users/bartuozel/.ralph-looper/database.sqlite',
  },
} satisfies Config;
