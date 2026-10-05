# Database & Drizzle Multi-Schema — Implementation Guide

Read this file when: defining Drizzle tables, managing migrations with `drizzle-kit`, or configuring PostgreSQL connection pooling.

---

## 1. Connection Pool (`src/database/connection.ts`)

Source of truth: `src/database/connection.ts` — read it rather than copying it. The essentials:

```typescript
import { databaseConfig } from '../config';

export const sqlClient = postgres(databaseConfig.DATABASE_URL, {
  max: databaseConfig.DB_MAX_CONNECTIONS, // DB_MAX_CONNECTIONS, default 20
  idle_timeout: databaseConfig.DB_IDLE_TIMEOUT_SECONDS, // default 30
  connect_timeout: 10,
});

export const db = drizzle(sqlClient, { schema });
```

- Settings come from the validated `databaseConfig` group (`src/config/database.config.ts`), never from `process.env`.
- The client is lazy: it connects on the first query, so importing it never opens a connection.
- Only `src/database/**` and `src/index.ts` (startup check, shutdown `sqlClient.end()`) may import it — modules use `TransactionHost` (ESLint + depcruise `no-module-direct-db-connection`). Health checks use `pingDatabase()` (`src/database/health-probe.ts`, 2 s timeout).
- Tests never reach a real database: `bunfig.toml` preloads `test/setup/hermetic-env.ts`, which points `DATABASE_URL` at a closed local port whatever the local env file says.

---

## 2. Multi-Schema Architecture

> **Current state vs this section**: today's tables use `domainTable` from `src/database/schema/domain/schema.ts` (in the schema named by `DB_SCHEMA`, default `public`) — follow that file and `users.schema.ts`. The `pgSchema` examples below describe the target layout and are rewritten with the column helpers in plan step 2.2.

The database is divided into two distinct schema spaces:
1. `domain`: Application-specific tables with full CRUD capabilities and Drizzle automated migrations.
2. `reference`: Cross-system reference tables (e.g. ports, country codes, roles) that are **Read-Only** (`SELECT` only).

### Defining a Domain Table (`src/database/schema/domain/users.schema.ts`)
```typescript
import { pgSchema, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

export const domainSchema = pgSchema('domain');

export const users = domainSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Defining a Reference Table (`src/database/schema/reference/ref-roles.schema.ts`)
```typescript
import { pgSchema, varchar, timestamp } from 'drizzle-orm/pg-core';

export const referenceSchema = pgSchema('reference');

export const refRoles = referenceSchema.table('ref_roles', {
  code: varchar('code', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type RefRole = typeof refRoles.$inferSelect;
```

---

## 3. Migrations (`drizzle.config.ts`)

Source of truth: `drizzle.config.ts` (a standalone drizzle-kit config — together with `src/config/env-source.ts` the only files allowed to read `process.env`). Today it generates migrations from `src/database/schema/index.ts` into `./drizzle`, filtered by the `DB_SCHEMA` env var (default `public`).

- Generate: `bun run db:generate`. Apply: `bun run db:migrate` — **run by the developer**; AI agents never execute commands against a database.
- Planned (step 2.2): one project-named `pgSchema` constant (`APP_SCHEMA_NAME`, registered in `IDENTITY_RULES`) replaces `DB_SCHEMA`; reference tables become `.view().existing()` so drizzle-kit never creates or migrates them, and §2 above is rewritten accordingly.
