# Unit & E2E Testing — Implementation Guide

Read this file when: writing new test suites, mocking dependencies, or validating test coverage.

---

## 1. Test Architecture Overview

- **Test Runner**: Native Bun Test (`bun:test`)
- **Execution Command**: `bun test`
- **Coverage Command**: `bun run test:cov` (coverage gate; thresholds in `scripts/check-coverage.ts`)
- **Unit Tests**: Co-located with implementation files (`src/**/*.test.ts`).
- **E2E Tests**: Blackbox integration tests located under `test/*.e2e.test.ts`.

---

## 2. Unit Testing Controllers

Controllers return pure `ApiResponse` wrapped by `asyncHandler`. Test them by supplying a lightweight mock `Context`:

```typescript
import { describe, expect, it } from 'bun:test';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

describe('UsersController (Unit)', () => {
  const mockService = {
    createUser: async () => ({ id: '123', email: 'test@example.com', fullName: 'Test' }),
  } as unknown as UsersService;

  const controller = new UsersController(mockService);
  const mockNext = (async () => {}) as any;

  it('create should return ApiResponse with status 201', async () => {
    const mockContext = {
      get: (key: string) =>
        key === 'validatedBody' ? { email: 'test@example.com', fullName: 'Test', password: 'secretpassword' } : undefined,
      json: (data: unknown, status: number) => ({ data, status }),
    } as any;

    const result = (await controller.create(mockContext, mockNext)) as unknown as {
      status: number;
      data: { success: boolean; data: { email: string } };
    };

    expect(result.status).toBe(201);
    expect(result.data.success).toBe(true);
  });
});
```

---

## 3. Unit Testing Services

Services accept typed DTOs and return entities or throw semantic `ApiError` instances:

```typescript
import { describe, expect, it } from 'bun:test';
import { UsersService } from './users.service';
import { ConflictError } from '../../core/errors';
import type { UsersRepository } from './users.repository';

describe('UsersService (Unit)', () => {
  it('should throw ConflictError if email already exists', async () => {
    const mockRepo = {
      findByEmail: async () => ({ id: '123', email: 'taken@example.com' }),
    } as unknown as UsersRepository;

    const service = new UsersService(mockRepo);

    expect(
      service.createUser({ email: 'taken@example.com', fullName: 'Test', password: 'secretpassword' })
    ).rejects.toThrow(ConflictError);
  });
});
```

---

## 4. Blackbox E2E HTTP Testing (`test/health.e2e.test.ts`)

Instantiate fresh `createApp()` and dispatch requests via `app.request()`:

```typescript
import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';

describe('Health E2E Probe', () => {
  it('GET /health/liveness should return 200 with OK status', async () => {
    const app = createApp();
    const res = await app.request('/health/liveness');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { status: string } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });
});
```
