import { describe, expect, it } from 'bun:test';
import { toUserResponse, toUserListResponse } from './users.transformer';
import type { User } from '../../database/schema';

describe('UsersTransformer (Unit)', () => {
  const sampleUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'test@example.com',
    fullName: 'Test User',
    passwordHash: 'secret_hash',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should strip passwordHash from single user response', () => {
    const res = toUserResponse(sampleUser);
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
