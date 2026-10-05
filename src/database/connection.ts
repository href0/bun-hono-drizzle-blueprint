import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { databaseConfig } from '../config';
import * as schema from './schema';

export const sqlClient = postgres(databaseConfig.DATABASE_URL, {
  max: databaseConfig.DB_MAX_CONNECTIONS,
  idle_timeout: databaseConfig.DB_IDLE_TIMEOUT_SECONDS,
  connect_timeout: 10,
  // Session time zone UTC (plan D13): server-side now(), date_trunc and timestamptz-to-text casts
  // never depend on the database server's configured zone.
  connection: { timezone: 'UTC' }, // GUC names are case-insensitive (TimeZone)
});

export const db = drizzle(sqlClient, { schema });
export type DrizzleDatabase = typeof db;
