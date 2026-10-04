import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../config/env.config';
import * as schema from './schema';

export const sqlClient = postgres(env.DATABASE_URL, {
  max: env.DB_MAX_CONNECTIONS,
  idle_timeout: env.DB_IDLE_TIMEOUT_SECONDS,
  connect_timeout: 10,
});

export const db = drizzle(sqlClient, { schema });
export type DrizzleDatabase = typeof db;
