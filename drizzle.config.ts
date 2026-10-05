import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Tables live in `public` (a project owns its database); reference views are `.existing()`.
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/app_db',
  },
  verbose: true,
  strict: true,
});
