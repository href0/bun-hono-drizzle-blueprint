# Raw SQL Queries — Safety Standards & Patterns

Read this file when: executing complex SQL queries that cannot be expressed via Drizzle's query builder (recursive CTEs, window functions, complex joins).

---

## 1. Safety Mandate: Tagged Template Literal `sql`

**NEVER concatenate user input into SQL strings.**
Drizzle's `sql` tagged template literal automatically parameterizes interpolated expressions (`$1`, `$2`, etc.), preventing SQL injection vulnerabilities.

```typescript
import { sql } from 'drizzle-orm';

// SAFE — Parameterized by Drizzle
const result = await this.txHost.tx.execute(
  sql`SELECT id, email FROM users WHERE email = ${userEmail}`
);

// FORBIDDEN — SQL Injection Risk
const result = await this.txHost.tx.execute(
  sql.raw(`SELECT id FROM users WHERE email = '${userEmail}'`)
);
```

---

## 2. When `sql.raw()` IS Allowed

> **ESLint Guard** (`SQL_RAW_RULES`): `sql.raw(` is rejected everywhere in `src/`. Prefer `sql.identifier()`; a static fragment needs `// eslint-disable-next-line no-restricted-syntax -- <reason>`.

`sql.raw()` is ONLY permitted for static, trusted SQL identifiers, table names, or schema names where no user input is present:

```typescript
// PREFERRED for identifiers: sql.identifier() quotes the name (never user input)
const sortColumn = sql.identifier('created_at');
const result = await this.txHost.tx.execute(
  sql`SELECT id FROM users WHERE is_active = ${isActive} ORDER BY ${sortColumn} DESC`
);

// ALLOWED only as a last resort: a static, trusted SQL fragment
const direction = sql.raw('DESC');
```

---

## 3. Dedicated Queries Files (`*.queries.ts`)

For complex raw SQL, extract queries into a separate file ending with `.queries.ts` — the only module files where `tx.execute(` is allowed (ESLint `RAW_QUERY_RULES`). They are read-only: `UPDATE` / `DELETE FROM` inside `` sql`…` `` is rejected in every module file (`RAW_WRITE_SQL_RULES`), and so are `tx.insert/update/delete` (`TX_WRITE_RULES`):
- Domain-specific: `src/modules/<name>/<name>.queries.ts`
- Shared cross-domain: `src/database/queries/<name>.queries.ts`

```typescript
// src/modules/users/users.queries.ts
import { sql } from 'drizzle-orm';
import type { TransactionHost } from '../../database';

export const getActiveUserStatsQuery = async (txHost: TransactionHost) => {
  return txHost.tx.execute(
    sql`SELECT count(*)::int AS total, is_active FROM users GROUP BY is_active`
  );
};
```
