import { describe, expect, it, spyOn, beforeAll, afterAll } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
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
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
};

// No module mocks: the test env is hermetic (bunfig.toml preload) and the clients are lazy — the
// database and Redis are never contacted because the service is spied. A global mock.module()
// would leak into every later test file.

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
        throw new ConflictError('User with this email already exists', {
          details: [{ field: 'email', message: 'Email is already registered' }],
        });
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
          full_name: 'New User',
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
      expect(body.message).toBe('Pengguna berhasil dibuat');
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
          full_name: 'Existing User',
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
        body: JSON.stringify({ email: 'test@example.com' }), // missing full_name, password
      });

      expect(res.status).toBe(400);

      const body = (await res.json()) as {
        success: boolean;
        error: { type: string; details: Array<{ field: string }> };
      };

      expect(body.success).toBe(false);
      expect(body.error.type).toBe('VALIDATION_ERROR');
      const fields = body.error.details.map((d) => d.field);
      expect(fields).toContain('full_name');
      expect(fields).toContain('password');
    });

    it('should return 400 VALIDATION_ERROR for invalid email format', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', full_name: 'Test', password: 'password123' }),
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
      expect(body.error.details[0]?.message).toBe('Sintaks JSON pada body request tidak valid');
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const res = await app.request('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@mail.com', full_name: 'Test', password: 'short' }),
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
      const res = await app.request('/api/v1/users?page=1&per_page=10');
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
      const res = await app.request('/api/v1/users?page=0&per_page=9999');
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

describe('Users Module — E2E: update, soft delete, restore', () => {
  let app: Hono;
  const spies: ReturnType<typeof spyOn>[] = [];
  const otherId = 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a99';

  beforeAll(() => {
    spies.push(
      spyOn(usersService, 'updateUser').mockImplementation(async (id, dto) => {
        if (id !== mockUser.id) throw new NotFoundError('User not found');
        return { ...mockUser, ...dto };
      }),
      spyOn(usersService, 'deleteUser').mockImplementation(async (id) => {
        if (id !== mockUser.id) throw new NotFoundError('User not found');
      }),
      spyOn(usersService, 'restoreUser').mockImplementation(async (id) => {
        if (id !== mockUser.id) throw new ConflictError('User with this email already exists');
        return mockUser;
      }),
    );
    app = createApp();
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  const patch = (id: string, body: unknown): Promise<Response> =>
    Promise.resolve(
      app.request(`/api/v1/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('PATCH /:id updates only the given fields (snake_case in and out)', async () => {
    const res = await patch(mockUser.id, { full_name: 'Renamed', is_active: false });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { full_name: string; is_active: boolean } };
    expect(body.data.full_name).toBe('Renamed');
    expect(body.data.is_active).toBe(false);
  });

  it('PATCH /:id rejects an empty body, camelCase keys and an invalid email', async () => {
    expect((await patch(mockUser.id, {})).status).toBe(400);

    const camel = (await (await patch(mockUser.id, { fullName: 'x' })).json()) as {
      error: { code: string };
    };
    expect(camel.error.code).toBe('ERR_NON_SNAKE_CASE_KEY');

    expect((await patch(mockUser.id, { email: 'not-an-email' })).status).toBe(400);
  });

  it('PATCH /:id → 404 for an unknown user, 400 for a non-UUID id', async () => {
    expect((await patch(otherId, { full_name: 'x' })).status).toBe(404);
    expect((await patch('nope', { full_name: 'x' })).status).toBe(400);
  });

  it('DELETE /:id soft-deletes (200, data null) and 404s for an unknown user', async () => {
    const res = await app.request(`/api/v1/users/${mockUser.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toBeNull();

    expect((await app.request(`/api/v1/users/${otherId}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('POST /:id/restore returns the user, 409 when its email was taken meanwhile', async () => {
    const res = await app.request(`/api/v1/users/${mockUser.id}/restore`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { id: string } }).data.id).toBe(mockUser.id);

    const conflict = await app.request(`/api/v1/users/${otherId}/restore`, { method: 'POST' });
    expect(conflict.status).toBe(409);
  });
});
