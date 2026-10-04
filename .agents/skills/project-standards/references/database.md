# Database & Drizzle Multi-Schema — Implementation Guide

Read this file when: defining Drizzle tables, managing migrations with `drizzle-kit`, or configuring PostgreSQL connection pooling.

---

## 1. Connection Pool (`src/database/connection.ts`)

PostgreSQL is accessed via `postgres` driver (native high-performance connection pool) wrapped by Drizzle ORM:

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../config';
import * as schema from './schema';

export const sqlPool = postgres(env.DATABASE_URL, {
  max: env.DB_MAX_CONNECTIONS ?? 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(sqlPool, { schema });
```

---

## 2. Multi-Schema Architecture

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

## 3. Migration Isolation (`drizzle.config.ts`)

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/domain', // Only generate migrations for domain schema
  out: './drizzle',
  schemaFilter: ['domain'],               // Protects reference schemas from being modified
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  verbose: true,
  strict: true,
});
```
