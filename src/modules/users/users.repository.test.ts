import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { UsersRepository } from './users.repository';
import type { TransactionHost } from '../../database/transaction-host';
import type { User } from '../../database/schema';

describe('UsersRepository (Unit)', () => {
  const sampleUser: User = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'repo@example.com',
    fullName: 'Repo User',
    passwordHash: 'hash',
    isActive: true,
    createdAt: Temporal.Now.instant(),
    updatedAt: Temporal.Now.instant(),
  };

  const mockTx = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([sampleUser]),
        limit: () => ({
          offset: () => Promise.resolve([sampleUser]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([sampleUser]),
      }),
    }),
  };

  const mockTxCount = {
    select: () => ({
      from: () => Promise.resolve([{ count: 5 }]),
    }),
  };

  it('findById should query via txHost.tx', async () => {
    const repo = new UsersRepository({ tx: mockTx } as unknown as TransactionHost);
    const result = await repo.findById(sampleUser.id);
    expect(result).toEqual(sampleUser);
  });

  it('findByEmail should query via txHost.tx', async () => {
    const repo = new UsersRepository({ tx: mockTx } as unknown as TransactionHost);
    const result = await repo.findByEmail(sampleUser.email);
    expect(result).toEqual(sampleUser);
  });

  it('create should return created user on successful INSERT', async () => {
    const repo = new UsersRepository({ tx: mockTx } as unknown as TransactionHost);
    const result = await repo.create({
      email: sampleUser.email,
      fullName: sampleUser.fullName,
      passwordHash: sampleUser.passwordHash,
      isActive: true,
    });
    expect(result).toEqual(sampleUser);
  });

  it('create should throw Error if INSERT returns empty array', async () => {
    const emptyInsertTx = {
      ...mockTx,
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    };
    const repo = new UsersRepository({ tx: emptyInsertTx } as unknown as TransactionHost);
    expect(
      repo.create({
        email: sampleUser.email,
        fullName: sampleUser.fullName,
        passwordHash: sampleUser.passwordHash,
        isActive: true,
      }),
    ).rejects.toThrow('INSERT INTO users returned no rows');
  });

  it('findAll should query with limit and offset', async () => {
    const repo = new UsersRepository({ tx: mockTx } as unknown as TransactionHost);
    const result = await repo.findAll(10, 0);
    expect(result).toEqual([sampleUser]);
  });

  it('count should return integer count', async () => {
    const repo = new UsersRepository({ tx: mockTxCount } as unknown as TransactionHost);
    const total = await repo.count();
    expect(total).toBe(5);
  });
});
