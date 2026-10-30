import { pgSchema, pgTable } from 'drizzle-orm/pg-core';

/**
 * Where tables live. A project owns its database, so its tables use PostgreSQL's default `public`
 * schema — no project-named schema to configure or migrate. (Schema-per-tenant SaaS is a separate,
 * optional feature: docs/decisions.md §3 (backlog).)
 *
 * Declare every table with `appTable(...)` — ESLint bans raw `pgTable(` and `pgSchema(` elsewhere,
 * so this file stays the single switch if the layout ever changes.
 */
export const appTable = pgTable;

/**
 * Tables owned by another system, read here through `.view(...).existing()`: drizzle-kit never
 * creates or migrates them, and inserting into them fails at compile time. Optional — keep it only
 * if your project reads such data; point the name at the schema that data really lives in.
 */
export const referenceSchema = pgSchema('reference');
