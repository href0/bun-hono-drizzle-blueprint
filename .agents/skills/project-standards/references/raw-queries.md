# Raw SQL Queries — Safety Standards & Patterns

Read this file when: executing complex SQL queries that cannot be expressed via Drizzle's query builder (recursive CTEs, window functions, complex multi-schema joins).

---

## 1. Safety Mandate: Tagged Template Literal `sql`

**NEVER concatenate user input into SQL strings.**
Drizzle's `sql` tagged template literal automatically parameterizes interpolated expressions (`$1`, `$2`, etc.), preventing SQL injection vulnerabilities.

```typescript
import { sql } from 'drizzle-orm';

// SAFE — Parameterized by Drizzle
const result = await this.txHost.tx.execute(
  sql`SELECT id, email FROM domain.users WHERE email = ${userEmail}`
);

// FORBIDDEN — SQL Injection Risk
const result = await this.txHost.tx.execute(
  sql.raw(`SELECT id FROM domain.users WHERE email = '${userEmail}'`)
);
```

---

## 2. When `sql.raw()` IS Allowed

`sql.raw()` is ONLY permitted for static, trusted SQL identifiers, table names, or schema names where no user input is present:

```typescript
// ALLOWED: Static schema identifier
const schemaName = sql.raw('domain');
const result = await this.txHost.tx.execute(
  sql`SELECT * FROM ${schemaName}.users WHERE id = ${userId}`
);
```

---

## 3. Dedicated Queries Files (`*.queries.ts`)

For complex raw SQL, extract queries into a separate file ending with `.queries.ts`:
- Domain-specific: `src/modules/<name>/<name>.queries.ts`
- Shared cross-domain: `src/database/queries/<name>.queries.ts`

```typescript
// src/modules/users/users.queries.ts
import { sql } from 'drizzle-orm';
import type { TransactionHost } from '../../database';

export const getActiveUserStatsQuery = async (txHost: TransactionHost) => {
  return txHost.tx.execute(
    sql`SELECT count(*)::int AS total, is_active FROM domain.users GROUP BY is_active`
  );
};
```
