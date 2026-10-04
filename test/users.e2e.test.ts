import { describe, expect, it, mock, spyOn, beforeAll, afterAll } from 'bun:test';
import type { User } from '../src/database/schema';
import type { Hono } from 'hono';
import { createApp } from '../src/app';
import { usersService } from '../src/modules/users/users.service';
import { ConflictError, NotFoundError } from '../src/core/errors';

/**
 * Users Module — E2E Contract Tests
 *
 * Strategy: Use spyOn on the singleton usersService rather than mock.module().
 * Bun's mock.module() replaces the exported class globally across all test files in the process,
 * which pollutes users.service.test.ts. spyOn only intercepts method calls on the shared singleton.
 */

const mockUser: User = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  email: 'test@example.com',
  fullName: 'Test User',
  passwordHash: '$argon2id$v=19$m=16,t=2,p=1$abc',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// Mock database connection — no real DB needed for contract tests
void mock.module('../src/database/connection', () => ({
  sqlClient: Object.assign(async () => Promise.resolve([{ '?column?': 1 }]), {
    end: async () => Promise.resolve(),
  }),
  db: {},
}));

// Mock redis client — avoid real Redis dependency
void mock.module('../src/core/cache/redis.client', () => ({
  redisClient: {
    status: 'ready',
    get: mock(() => Promise.resolve(null)),
    setex: mock(() => Promise.resolve('OK')),
    del: mock(() => Promise.resolve(1)),
    quit: mock(() => Promise.resolve('OK')),
    ping: mock(() => Promise.resolve('PONG')),
    on: mock(() => {}),
    connect: mock(() => Promise.resolve()),
  },
}));

// --- Tests ---

describe('Users Module — E2E Contract Tests', () => {
  let app: Hono;
  let createUserSpy: ReturnType<typeof spyOn>;
  let getUserByIdSpy: ReturnType<typeof spyOn>;
  let listUsersSpy: ReturnType<typeof spyOn>;
  let getUserExternalPostsSpy: ReturnType<typeof spyOn>;

  beforeAll(() => {
    createUserSpy = spyOn(usersService, 'createUser').mockImplementation(async (dto) => {
      if (dto.email === 'existing@example.com') {
        throw new ConflictError('User with this email already exists', [
          { field: 'email', message: 'Email is already registered' },
        ]);
      }
      return mockUser;
    });

    getUserByIdSpy = spyOn(usersService, 'getUserById').mockImplementation(async (id) => {
      if (id === mockUser.id) return mockUser;
      throw new NotFoundError(`User with ID ${id} not found`);
    });

    listUsersSpy = spyOn(usersService, 'listUsers').mockImplementation(async () => {
      return { users: [mockUser], total: 1 };
    });

    getUserExternalPostsSpy = spyOn(usersService, 'getUserExternalPosts').mockImplementation(
      async () => [{ id: 1, userId: 1, title: 'Sample Post', body: 'Sample Body' }],
    );

    app = createApp();
  });

  afterAll(() => {
    createUserSpy.mockRestore();
    getUserByIdSpy.mockRestore();
    listUsersSpy.mockRestore();
    getUserExternalPostsSpy.mockRestore();
  });

  // ---- POST /api/v1/users ----

  describe('POST /api/v1/users', () => {
    it('should return 201 with user data and snake_case wire format on successful registration', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'new@example.com',
          fullName: 'New User',
          password: 'securepassword',
        }),
      });

      expect(res.status).toBe(201);

      const body = (await res.json()) as {
        success: boolean;
        status_code: number;
        message: string;
        data: { id: string; email: string; full_name: string; is_active: boolean };
      };

      expect(body.success).toBe(true);
      expect(body.status_code).toBe(201);
      expect(body.message).toBe('User created successfully');
      // Verify snake_case wire format — core contract invariant
      expect(body.data.full_name).toBe('Test User');
      expect(body.data.is_active).toBe(true);
      expect(body.data.email).toBe('test@example.com');
    });

    it('should return 409 Conflict when email is already registered', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          fullName: 'Existing User',
          password: 'securepassword',
        }),
      });

      expect(res.status).toBe(409);

      const body = (await res.json()) as {
        success: boolean;
        error: { type: string; code: string };
      };

      expect(body.success).toBe(false);
      expect(body.error.type).toBe('CONFLICT');
    });

    it('should return 400 VALIDATION_ERROR for missing required fields', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' }), // missing fullName, password
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as {
        success: boolean;
        error: { type: string; details: Array<{ field: string }> };
      };

      expect(body.success).toBe(false);
      expect(body.error.type).toBe('VALIDATION_ERROR');
      const fields = body.error.details.map((d) => d.field);
      expect(fields).toContain('fullName');
      expect(fields).toContain('password');
    });

    it('should return 400 VALIDATION_ERROR for invalid email format', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', fullName: 'Test', password: 'password123' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { details: Array<{ field: string }> };
      };
      expect(body.error.details.map((d) => d.field)).toContain('email');
    });

    it('should return 400 with explicit error for malformed JSON body', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": "test@mail.com", }', // trailing comma = invalid JSON
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as {
        error: { type: string; details: Array<{ field: string; message: string }> };
      };

      // Must distinguish malformed JSON from field validation errors
      expect(body.error.type).toBe('VALIDATION_ERROR');
      expect(body.error.details[0]?.field).toBe('body');
      expect(body.error.details[0]?.message).toContain('invalid JSON');
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@mail.com', fullName: 'Test', password: 'short' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { details: Array<{ field: string }> };
      };
      expect(body.error.details.map((d) => d.field)).toContain('password');
    });
  });

  // ---- GET /api/v1/users ----

  describe('GET /api/v1/users', () => {
    it('should return 200 with paginated user list and snake_case meta', async () => {
      const res = await app.request('/api/v1/users?page=1&limit=10');
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        success: boolean;
        status_code: number;
        data: unknown[];
        meta: {
          current_page: number;
          per_page: number;
          total_items: number;
          total_pages: number;
        };
      };

      expect(body.success).toBe(true);
      expect(body.status_code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.current_page).toBe(1);
      expect(body.meta.per_page).toBe(10);
      expect(typeof body.meta.total_items).toBe('number');
      expect(typeof body.meta.total_pages).toBe('number');
    });

    it('should return 400 VALIDATION_ERROR for invalid pagination params', async () => {
      const res = await app.request('/api/v1/users?page=0&limit=9999');
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { type: string } };
      expect(body.error.type).toBe('VALIDATION_ERROR');
    });
  });

  // ---- GET /api/v1/users/:id ----

  describe('GET /api/v1/users/:id', () => {
    it('should return 200 with user data for valid existing UUID', async () => {
      const res = await app.request(`/api/v1/users/${mockUser.id}`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        success: boolean;
        data: { id: string; email: string };
      };

      expect(body.success).toBe(true);
      expect(body.data.id).toBe(mockUser.id);
      expect(body.data.email).toBe(mockUser.email);
    });

    it('should return 400 VALIDATION_ERROR for non-UUID id param', async () => {
      const res = await app.request('/api/v1/users/not-a-valid-uuid');
      expect(res.status).toBe(400);

      const body = (await res.json()) as {
        error: { type: string; details: Array<{ field: string }> };
      };

      expect(body.error.type).toBe('VALIDATION_ERROR');
      expect(body.error.details.map((d) => d.field)).toContain('id');
    });

    it('should return 404 for valid UUID that does not exist', async () => {
      const nonExistentId = 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a99';
      const res = await app.request(`/api/v1/users/${nonExistentId}`);
      expect(res.status).toBe(404);

      const body = (await res.json()) as {
        success: boolean;
        error: { type: string };
      };

      expect(body.success).toBe(false);
      expect(body.error.type).toBe('NOT_FOUND');
    });

    it('GET /:id/external-posts should return 200 with external posts array', async () => {
      const res = await app.request(`/api/v1/users/${mockUser.id}/external-posts`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        success: boolean;
        status_code: number;
        data: Array<{ id: number; title: string }>;
      };

      expect(body.success).toBe(true);
      expect(body.status_code).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data[0]?.title).toBe('Sample Post');
    });
  });
});
