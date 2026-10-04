import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: [process.env.DB_SCHEMA || 'public'],
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/app_db',
  },
  verbose: true,
  strict: true,
});
