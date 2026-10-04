import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { databaseConfig } from '../config';
import * as schema from './schema';

export const sqlClient = postgres(databaseConfig.DATABASE_URL, {
  max: databaseConfig.DB_MAX_CONNECTIONS,
  idle_timeout: databaseConfig.DB_IDLE_TIMEOUT_SECONDS,
  connect_timeout: 10,
});

export const db = drizzle(sqlClient, { schema });
export type DrizzleDatabase = typeof db;
