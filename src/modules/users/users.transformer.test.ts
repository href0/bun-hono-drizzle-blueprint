import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { toUserResponse, toUserListResponse } from './users.transformer';
import type { User } from '../../database/schema';

describe('UsersTransformer (Unit)', () => {
  const sampleUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'secret_hash',
    role: 'user',
    passwordChangedAt: null,
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
    isActive: true,
    createdAt: Temporal.Now.instant(),
    updatedAt: Temporal.Now.instant(),
  };

  it('should strip passwordHash from single user response', () => {
    const res = toUserResponse(sampleUser);
    expect(Object.keys(res).sort()).toEqual([
      'createdAt',
      'email',
      'fullName',
      'id',
      'isActive',
      'role',
      'updatedAt',
    ]);
    expect(res.role).toBe('user');
    expect(res.id).toBe(sampleUser.id);
    expect(res.email).toBe(sampleUser.email);
    expect(res.fullName).toBe(sampleUser.fullName);
    expect(res.isActive).toBe(sampleUser.isActive);
    expect('passwordHash' in res).toBe(false);
  });

  it('should strip passwordHash from user list response', () => {
    const list = toUserListResponse([sampleUser]);
    expect(list.length).toBe(1);
    expect('passwordHash' in list[0]).toBe(false);
  });
});
