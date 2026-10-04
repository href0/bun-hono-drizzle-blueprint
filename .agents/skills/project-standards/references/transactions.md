# Declarative Transactions — Implementation Guide

Read this file when: implementing atomic business operations, writing Repository classes, or using `@Transactional()` / `runInTransaction()`.

---

## 1. How It Works: Bun Native `AsyncLocalStorage`

Transaction propagation uses `AsyncLocalStorage` to store the active Drizzle transaction instance across async execution chains without manually threading client arguments through services.

```
@Transactional() / runInTransaction()
  ├── Checks if transaction context already exists (Supports Nested Context)
  ├── If root: opens db.transaction(async (tx) => ...)
  │     ├── Stores `tx` in AsyncLocalStorage
  │     ├── Executes service method
  │     └── If no error thrown → COMMIT
  │     └── If exception thrown → ROLLBACK
  └── Repositories query `this.txHost.tx`, automatically resolving active `tx` or root `db`
```

---

## 2. Using `TransactionHost` in Repositories

> **ESLint Guard**: Importing `db` directly into repositories is prohibited by ESLint AST rule `no-direct-db-in-repositories`. Repositories MUST use `TransactionHost`.

```typescript
import { eq } from 'drizzle-orm';
import { TransactionHost, txHost as defaultTxHost } from '../../database';
import { users, type User, type NewUser } from '../../database/schema';

export class UsersRepository {
  constructor(private readonly txHost: TransactionHost = defaultTxHost) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.txHost.tx
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await this.txHost.tx
      .insert(users)
      .values(data)
      .returning();
    return user;
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

## 4. Unit Testing Repositories with Mock `TransactionHost`

```typescript
import { describe, expect, it } from 'bun:test';
import { UsersRepository } from './users.repository';
import type { TransactionHost } from '../../database';

describe('UsersRepository (Unit)', () => {
  it('should query via txHost.tx', async () => {
    const mockUser = { id: 'uuid-1', email: 'test@example.com' };
    const mockTx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [mockUser],
          }),
        }),
      }),
    };

    const mockTxHost = { tx: mockTx } as unknown as TransactionHost;
    const repo = new UsersRepository(mockTxHost);

    const result = await repo.findById('uuid-1');
    expect(result).toEqual(mockUser as any);
  });
});
```
