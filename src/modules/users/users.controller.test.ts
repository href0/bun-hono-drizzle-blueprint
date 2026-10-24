import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';
import type { User } from '../../database/schema';

describe('UsersController (Unit)', () => {
  const mockUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'hash',
    role: 'user',
    passwordChangedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
    isActive: true,
    createdAt: Temporal.Now.instant(),
    updatedAt: Temporal.Now.instant(),
  };

  const mockService: Partial<UsersService> = {
    createUser: async () => mockUser,
    getUserById: async () => mockUser,
    listUsers: async () => ({ users: [mockUser], total: 1 }),
    updateUser: async (_id, dto) => ({ ...mockUser, ...dto }),
    deleteUser: async () => undefined,
    restoreUser: async () => mockUser,
  };

  const controller = new UsersController(mockService as UsersService);
  const mockNext = (async () => {}) as any;

  it('create should return ApiResponse with status 201', async () => {
    const mockContext = {
      get: (key: string) =>
        key === 'validatedBody'
          ? { email: 'test@example.com', fullName: 'Test User', password: 'password123' }
          : undefined,
      json: (data: unknown, status: number) => ({ data, status }),
    } as any;

    const result = (await controller.create(mockContext, mockNext)) as unknown as {
      status: number;
      data: { success: boolean; data: { email: string; full_name: string } };
    };
    expect(result.status).toBe(201);
    expect(result.data.success).toBe(true);
    expect(result.data.data.email).toBe('test@example.com');
    expect(result.data.data.full_name).toBe('Test User');
  });

  it('getById should return ApiResponse with status 200', async () => {
    const mockContext = {
      get: (key: string) =>
        key === 'validatedParams' ? { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } : undefined,
      json: (data: unknown, status: number) => ({ data, status }),
    } as any;

    const result = (await controller.getById(mockContext, mockNext)) as unknown as {
      status: number;
      data: { data: { id: string } };
    };
    expect(result.status).toBe(200);
    expect(result.data.data.id).toBe(mockUser.id);
  });

  it('list should return ApiResponse with status 200 and pagination meta', async () => {
    const mockContext = {
      get: (key: string) => (key === 'validatedQuery' ? { page: 1, perPage: 10 } : undefined),
      json: (data: unknown, status: number) => ({ data, status }),
    } as any;

    const result = (await controller.list(mockContext, mockNext)) as unknown as {
      status: number;
      data: { meta?: { current_page: number; total_items: number } };
    };
    expect(result.status).toBe(200);
    expect(result.data.meta).toBeDefined();
    expect(result.data.meta?.current_page).toBe(1);
    expect(result.data.meta?.total_items).toBe(1);
  });

  const contextWith = (values: Record<string, unknown>): any => ({
    get: (key: string) => values[key],
    json: (data: unknown, status: number) => ({ data, status }),
  });

  it('update should return the updated user', async () => {
    const result = (await controller.update(
      contextWith({ validatedParams: { id: mockUser.id }, validatedBody: { fullName: 'New' } }),
      mockNext,
    )) as unknown as { status: number; data: { data: { full_name: string } } };

    expect(result.status).toBe(200);
    expect(result.data.data.full_name).toBe('New');
  });

  it('remove should return 200 with null data', async () => {
    const result = (await controller.remove(
      contextWith({ validatedParams: { id: mockUser.id } }),
      mockNext,
    )) as unknown as { status: number; data: { data: unknown } };

    expect(result.status).toBe(200);
    expect(result.data.data).toBeNull();
  });

  it('restore should return the restored user', async () => {
    const result = (await controller.restore(
      contextWith({ validatedParams: { id: mockUser.id } }),
      mockNext,
    )) as unknown as { status: number; data: { data: { id: string } } };

    expect(result.status).toBe(200);
    expect(result.data.data.id).toBe(mockUser.id);
  });
});
