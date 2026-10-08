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

```typescript
import { eq } from 'drizzle-orm';
import { InternalServerError } from '../../core/errors';
import { TransactionHost, defaultTxHost } from '../../database';
import { users, type User, type NewUser } from '../../database/schema';

export class UsersRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.txHost.tx.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const result = await this.txHost.tx.insert(users).values(data).returning();
    // Drizzle types result[0] as always present; INSERT … RETURNING can still be empty at runtime.
    const created = result[0] as User | undefined;
    if (!created) {
      throw new InternalServerError('INSERT INTO users returned no rows.');
    }
    return created;
  }
}
```

---

## 3. Usage in Services: `@Transactional()` or `runInTransaction()`

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
