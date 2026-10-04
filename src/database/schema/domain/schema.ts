import { pgTable as basePgTable } from 'drizzle-orm/pg-core';

/**
 * Base table creator for primary domain entities.
 * Maps by default to PostgreSQL's native 'public' schema for zero-friction setup.
 */
export const domainTable = basePgTable;
