import { beforeEach, describe, expect, it } from 'bun:test';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { permission } from '../../core/security/rbac';
import { parseInstant } from '../../utils/datetime.util';
import { permissions, roles, type Permission, type Role } from '../schema';
import {
  findUnsyncedPermissions,
  PermissionRegistryError,
  syncPermissions,
  syncSummary,
  unsyncedPermissionsMessage,
} from './permission-sync';

const AT = parseInstant('2026-11-07T00:00:00Z');

const permissionRow = (key: string, overrides: Partial<Permission> = {}): Permission => ({
  id: Bun.randomUUIDv7(),
  key,
  label: 'Read orders',
  groupName: 'orders',
  source: 'api',
  retiredAt: null,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
  ...overrides,
});

const roleRow = (key: string): Role => ({
  id: Bun.randomUUIDv7(),
  key,
  name: key,
  description: null,
  isSystem: true,
  createdAt: AT,
  updatedAt: AT,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
});

const ORDERS_READ = permission('orders', 'read', 'Read orders');

describe('syncPermissions (SQL shape; the behaviour on PostgreSQL is test/integration/rbac.int.ts)', () => {
  const recorder = createSqlRecorder();
  const writes = (): string[] =>
    recorder.statements
      .map((statement) => statement.sql)
      .filter((sql) => sql.startsWith('insert') || sql.startsWith('update'));

  beforeEach(() => {
    recorder.reset();
  });

  it('refuses an invalid registry before touching the database', async () => {
    let error: unknown;
    try {
      await syncPermissions([ORDERS_READ, ORDERS_READ], recorder.txHost);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PermissionRegistryError);
    expect((error as Error).message).toContain('orders.read: declared more than once');
    expect(recorder.statements).toEqual([]);
  });

  it('writes nothing when the roles exist and every permission matches', async () => {
    recorder.respondWith(
      [['super_admin'], ['user']],
      [rowOf(permissions, permissionRow('orders.read'))],
    );

    const result = await syncPermissions([ORDERS_READ], recorder.txHost);

    expect(syncSummary(result)).toBe(
      'Permissions already in sync with the registry, nothing changed',
    );
    expect(writes()).toEqual([]);
    expect(
      recorder.statements.map((s) => s.sql).find((sql) => sql.includes('for update')),
    ).toContain('from "permissions"');
  });

  it('creates missing system roles and new permissions, stamped by the system actor', async () => {
    recorder.respondWith(
      [],
      [rowOf(roles, roleRow('super_admin'))],
      [rowOf(roles, roleRow('user'))],
      [],
      [rowOf(permissions, permissionRow('orders.read'))],
    );

    const result = await syncPermissions([ORDERS_READ], recorder.txHost);

    expect(result).toEqual({
      added: ['orders.read'],
      updated: [],
      retired: [],
      restored: [],
      rolesCreated: ['super_admin', 'user'],
    });
    expect(writes().map((sql) => sql.split(' (')[0])).toEqual([
      'insert into "roles"',
      'insert into "roles"',
      'insert into "permissions"',
    ]);
    const insert = recorder.statements.find((s) => s.sql.startsWith('insert into "permissions"'));
    expect(insert?.params).toEqual(
      expect.arrayContaining(['orders.read', 'Read orders', 'orders', 'api', 'system']),
    );
  });
});

describe('findUnsyncedPermissions', () => {
  it('returns the registry keys that are not live, unretired API permissions', async () => {
    const recorder = createSqlRecorder();
    recorder.respondWith([['orders.read']]);

    const missing = await findUnsyncedPermissions(
      [ORDERS_READ, permission('orders', 'create', 'Create orders')],
      recorder.txHost,
    );

    expect(missing).toEqual(['orders.create']);
    expect(recorder.statements[0]?.sql).toContain('"retired_at" is null');
  });

  it('asks nothing for an empty registry', async () => {
    const recorder = createSqlRecorder();
    expect(await findUnsyncedPermissions([], recorder.txHost)).toEqual([]);
    expect(recorder.statements).toEqual([]);
  });
});

describe('messages', () => {
  it('name every unsynced key and the command that fixes it', () => {
    expect(unsyncedPermissionsMessage(['orders.read', 'orders.create'])).toBe(
      'FATAL: 2 permission(s) of the code are not in the database: orders.read, orders.create. ' +
        'Run "bun run db:migrate" (or "bun run db:sync-permissions"). Server startup aborted.',
    );
  });

  it('summarize each kind of change on one line', () => {
    expect(
      syncSummary({
        added: ['a.read'],
        updated: [],
        retired: ['b.read', 'c.read'],
        restored: [],
        rolesCreated: ['user'],
      }),
    ).toBe(
      'Permissions synced with the registry — added: a.read; retired: b.read, c.read; system roles created: user',
    );
  });
});
