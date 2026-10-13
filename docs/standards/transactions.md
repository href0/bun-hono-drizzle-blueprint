# Declarative Transactions — Implementation Guide

Read this file when: implementing atomic business operations, writing Repository classes, or using `@Transactional()` / `runInTransaction()`.

---

## 1. How It Works: Bun Native `AsyncLocalStorage`

Transaction propagation uses `AsyncLocalStorage` to store the active Drizzle transaction instance across async execution chains without manually threading client arguments through services.

```
@Transactional() / runInTransaction()  =  defaultTxHost.run(fn)
  ├── Checks if transaction context already exists (Supports Nested Context)
  ├── If root: opens root.transaction(async (tx) => ...)   (root = `db`, or the connection injected into `new TransactionHost(root)`)
  │     ├── Stores `tx` in AsyncLocalStorage
  │     ├── Executes service method
  │     └── If no error thrown → COMMIT
  │     └── If exception thrown → ROLLBACK
  └── Repositories query `this.txHost.tx`, automatically resolving active `tx` or root `db`
```

---

## 2. Using `TransactionHost` in Repositories

> **ESLint Guard**: Importing `db` / `sqlClient` or `database/connection` in `src/modules/**` is prohibited by ESLint (`no-restricted-syntax` / `no-restricted-imports`) and dependency-cruiser (`no-module-direct-db-connection`). Repositories MUST use `TransactionHost`.

A module repository extends the base for its table kind (`BaseRepository`, `ChildRepository`, `DependentRepository`, `AppendOnlyRepository`, `ReadOnlyRepository` — [database.md §6](database.md)); the bases run every write in a transaction on `this.txHost` (joining the caller's, if any) and audit it. Custom lookups query `this.txHost.tx` directly — never through a variable (ESLint `TX_ALIAS_RULES`).

```typescript
import { eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { users, type User } from '../../database/schema';

export class UsersRepository extends BaseRepository<typeof users> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(users, txHost, { redact: ['passwordHash'] });
  }

  // findById, findPage, count, create, updateById, softDeleteById, restoreById come from the base.
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.txHost.tx
      .select()
      .from(users)
      .where(this.scoped(eq(users.email, email))) // live rows only
      .limit(1);
    return rows.at(0) ?? null;
  }
}
```

---

## 3. Usage in Services: `@Transactional()` or `runInTransaction()`

- Mark a method `@Transactional()` when it combines steps that must be atomic (check then write, several writes). Base-repository methods are transactional on their own and join the service's transaction.
- Pure reads need no transaction (they use the pool).

> **ESLint Guard** (`TRANSACTIONAL_RULES`, `TX_HOST_IMPORT_PATTERN`): `@Transactional()` is accepted only in `*.service.ts`; `TransactionHost` / `defaultTxHost` / `transactionStorage` only in repositories and `*.queries.ts` (module tests may use them).

### Decorator Pattern:
```typescript
import { Transactional } from '../../database';

export class OrdersService {
  constructor(
    private readonly ordersRepo: OrdersRepository,
    private readonly stockRepo: StockRepository,
  ) {}

  @Transactional()
  async placeOrder(orderDto: CreateOrderDto): Promise<Order> {
    const order = await this.ordersRepo.create(orderDto);
    await this.stockRepo.decrementStock(orderDto.productId, orderDto.quantity);
    // If decrementStock throws an error, the entire order creation is rolled back automatically
    return order;
  }
}
```

### Functional Pattern:
```typescript
import { runInTransaction } from '../../database';

export class OrdersService {
  async placeOrder(orderDto: CreateOrderDto): Promise<Order> {
    return runInTransaction(async () => {
      const order = await this.ordersRepo.create(orderDto);
      await this.stockRepo.decrementStock(orderDto.productId, orderDto.quantity);
      return order;
    });
  }
}
```

---

## 4. Unit Testing Repositories with the SQL Recorder

Inject the recorder's `TransactionHost` (`test/helpers/sql-recorder.ts`) and assert the SQL that is sent. Its Drizzle instance is real (production driver and schema); only the network is fake, so filters, ordering, paging, column mapping (`Temporal`) and `BEGIN` / `COMMIT` / `ROLLBACK` are all visible. Do not hand-write mocks of the `select().from().where()` chain: they return the same rows whatever the condition.

```typescript
import { beforeEach, describe, expect, it } from 'bun:test';
import { UsersRepository } from './users.repository';
import { users } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

describe('UsersRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repo = new UsersRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('findByEmail filters by email', async () => {
    recorder.respondWith([rowOf(users, sampleUser)]); // one result set per upcoming query

    expect(await repo.findByEmail(sampleUser.email)).toEqual(sampleUser);
    expect(recorder.statements).toEqual([
      { sql: 'select "id", … from "users" where "users"."email" = $1', params: [sampleUser.email] },
    ]);
  });

  it('rolls back when the work fails', async () => {
    await recorder.txHost.run(async () => { /* … */ throw failure; }).catch(() => undefined);

    expect(recorder.statements.at(-1)?.sql).toBe('ROLLBACK');
  });
});
```

- A query with nothing queued gets no rows; partial selects take raw rows (`respondWith([[5]])` for a count).
- The recorder proves what is **sent**, not how PostgreSQL reacts (constraints, partial indexes, `FOR UPDATE` locks) — that is the integration suite.
- `@Transactional()` / `runInTransaction()` use `defaultTxHost` (the real pool). Code that must be tested transactionally opens its transaction through its injected host (`this.txHost.run(...)`); a repository call inside joins it.
