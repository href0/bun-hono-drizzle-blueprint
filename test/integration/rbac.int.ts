import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createApp } from '../../src/app';
import { appConfig, redisConfig } from '../../src/config';
import { CacheService, cacheService, CACHE_KEYS } from '../../src/core/cache';
import { closeRedisClient, createRedisClient } from '../../src/core/cache/redis.client';
import { signAccessToken } from '../../src/core/security/jwt';
import { permission, SYSTEM_ROLES } from '../../src/core/security/rbac';
import { db, sqlClient } from '../../src/database/connection';
import { findUnsyncedPermissions, syncPermissions } from '../../src/database/rbac/permission-sync';
import {
  permissions,
  recordChanges,
  roles,
  userPermissions,
  userRoles,
  users,
} from '../../src/database/schema';
import { seedAdmin } from '../../src/database/seeds/seed-admin';
import { NOW } from '../../src/database/schema/columns';
import { defaultTxHost, transactionStorage } from '../../src/database/transaction-host';
import { runInTransaction } from '../../src/database/transactional.decorator';
import { isUniqueViolation } from '../../src/database/unique-violation';
import { RbacService, rbacService } from '../../src/modules/rbac/rbac.service';
import { usersService } from '../../src/modules/users/users.service';
import { PERMISSION_REGISTRY } from '../../src/permissions';
import { nowInstant } from '../../src/utils/datetime.util';
import { asActor, rejectionOf, unique } from '../helpers/integration';

/**
 * The RBAC tables on a real PostgreSQL (plan RBAC, step 1): the system roles and the move of
 * `users.role` into `user_roles` written by migration 0010, and the constraints the schema
 * declares (partial uniques, the permission source / `menu.` prefix CHECKs, RESTRICT foreign keys);
 * the sync of the permission registry (step 2), each test in a transaction that is rolled back; and
 * the effective permissions with their cache and invalidation (step 3) on a real PostgreSQL + Redis.
 */

const MIGRATION = 'drizzle/0010_rbac.sql';
const DATA_MARKER = '-- Data (hand-written';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SYSTEM = { createdBy: 'system', updatedBy: 'system' } as const;

/** The hand-written data statements of the migration, as `drizzle-kit migrate` runs them. */
const dataStatements = (): string[] => {
  const migration = readFileSync(MIGRATION, 'utf-8');
  const start = migration.indexOf(DATA_MARKER);
  expect(start).toBeGreaterThan(0);
  return migration
    .slice(start)
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
};

/** Rolls back whatever `fn` wrote: the shared run database keeps only the migration's rows. */
class Rollback extends Error {}
const inRolledBackTransaction = async (fn: (sql: typeof sqlClient) => Promise<void>) => {
  const error = await rejectionOf(
    sqlClient.begin(async (sql) => {
      await fn(sql as unknown as typeof sqlClient);
      throw new Rollback();
    }),
  );
  if (!(error instanceof Rollback)) throw error;
};

const sqlStateOf = (error: unknown): unknown => {
  const outer = error as { code?: unknown; cause?: { code?: unknown } } | undefined;
  return outer?.code ?? outer?.cause?.code;
};

const roleId = async (key: string): Promise<string> => {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.key, key), isNull(roles.deletedAt)));
  return row.id;
};

const insertUser = async (): Promise<string> => {
  const id = Bun.randomUUIDv7();
  await sqlClient`
    insert into users (id, email, full_name, password_hash, created_by, updated_by)
    values (${id}, ${`${unique('rbac')}@example.com`}, 'RBAC User', 'not-a-real-hash', 'system', 'system')`;
  return id;
};

describe('migration 0010: system roles', () => {
  it('creates super_admin and user as live system roles with UUID v7 ids', async () => {
    const rows = await db
      .select()
      .from(roles)
      .where(inArray(roles.key, ['super_admin', 'user']));
    expect(rows.map((row) => row.key).sort()).toEqual(['super_admin', 'user']);
    for (const row of rows) {
      expect(row.isSystem).toBe(true);
      expect(row.deletedAt).toBeNull();
      expect(row.createdBy).toBe('system');
      expect(row.id).toMatch(UUID_V7);
    }
  });
});

describe('migration 0010: users.role → user_roles', () => {
  it('gives every existing user exactly their role: admin → super_admin, user → user, others → a role of their own', async () => {
    await inRolledBackTransaction(async (sql) => {
      // The state before 0010's data part: users with a role (the column 0011 dropped, back as it
      // was — this transaction is rolled back), no RBAC rows yet.
      await sql.unsafe("alter table users add column role varchar(20) not null default 'user'");
      await sql`delete from user_roles`;
      await sql`delete from roles`;
      const people = {
        admin: Bun.randomUUIDv7(),
        user: Bun.randomUUIDv7(),
        manager: Bun.randomUUIDv7(),
      };
      for (const [role, id] of Object.entries(people)) {
        await sql`
          insert into users (id, email, full_name, password_hash, role, created_by, updated_by)
          values (${id}, ${`${unique(role)}@example.com`}, 'Before RBAC', 'x', ${role}, 'system', 'system')`;
      }

      for (const statement of dataStatements()) await sql.unsafe(statement);

      const assigned = await sql<
        { user_id: string; key: string; id: string; is_system: boolean }[]
      >`
        select ur.user_id, r.key, ur.id, r.is_system
        from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id in ${sql([people.admin, people.user, people.manager])}`;
      const byUser = new Map(assigned.map((row) => [row.user_id, row]));
      expect(assigned).toHaveLength(3);
      expect(byUser.get(people.admin)?.key).toBe('super_admin');
      expect(byUser.get(people.user)?.key).toBe('user');
      expect(byUser.get(people.manager)?.key).toBe('manager');
      expect(byUser.get(people.manager)?.is_system).toBe(false);
      for (const row of assigned) expect(row.id).toMatch(UUID_V7);

      const [{ count }] = await sql<{ count: number }[]>`
        select count(*)::int as count from users u
        where not exists (select 1 from user_roles ur where ur.user_id = u.id and ur.deleted_at is null)`;
      expect(count).toBe(0);
    });
  });
});

describe('RBAC constraints', () => {
  it('allows one live assignment of a role per user; after a revocation (soft delete) it can be given again', async () => {
    const userId = await insertUser();
    const role = await roleId('user');
    const assign = () =>
      db
        .insert(userRoles)
        .values({ id: Bun.randomUUIDv7(), userId, roleId: role, ...SYSTEM })
        .returning();

    const [first] = await assign();
    expect(isUniqueViolation(await rejectionOf(assign()))).toBe(true);

    await db.update(userRoles).set({ deletedAt: NOW }).where(eq(userRoles.id, first.id));
    const [again] = await assign();
    expect(again.id).not.toBe(first.id);
  });

  it('keeps menu permissions and API permissions apart: source api|menu, and menu. prefix ⇔ menu', async () => {
    const insert = (key: string, source: string) =>
      db
        .insert(permissions)
        .values({ id: Bun.randomUUIDv7(), key, label: key, groupName: 'test', source, ...SYSTEM });
    const suffix = unique('p');

    expect(sqlStateOf(await rejectionOf(insert(`orders.${suffix}`, 'menu')))).toBe('23514');
    expect(sqlStateOf(await rejectionOf(insert(`menu.${suffix}`, 'api')))).toBe('23514');
    expect(sqlStateOf(await rejectionOf(insert(`other.${suffix}`, 'ui')))).toBe('23514');

    expect(await rejectionOf(insert(`orders.${suffix}`, 'api'))).toBeUndefined();
    expect(await rejectionOf(insert(`menu.${suffix}`, 'menu'))).toBeUndefined();
  });

  it('refuses a hard delete of a role that is still referenced (ON DELETE RESTRICT)', async () => {
    const userId = await insertUser();
    const role = await roleId('user');
    await db.insert(userRoles).values({ id: Bun.randomUUIDv7(), userId, roleId: role, ...SYSTEM });

    const error = await rejectionOf(db.delete(roles).where(eq(roles.id, role)));
    expect(sqlStateOf(error)).toBe('23503');
  });
});

/** Runs `fn` in a transaction every repository joins (TransactionHost), then rolls it back. */
const inRolledBackSync = async (fn: () => Promise<void>) => {
  const error = await rejectionOf(
    db.transaction((tx) =>
      transactionStorage.run(tx, async () => {
        await fn();
        throw new Rollback();
      }),
    ),
  );
  if (!(error instanceof Rollback)) throw error;
};

const apiPermission = async (key: string) => {
  const [row] = await defaultTxHost.tx
    .select()
    .from(permissions)
    .where(and(eq(permissions.key, key), isNull(permissions.deletedAt)));
  return row;
};

describe('permission registry sync (step 2)', () => {
  const group = unique('sync');
  const read = permission(group, 'read', 'Read things');
  const approve = permission(group, 'approve', 'Approve things');

  it('adds every registry key once: a second run changes nothing (idempotent)', async () => {
    await inRolledBackSync(async () => {
      // The suite's database is synced like `db:migrate` leaves it; start from one that is not.
      await defaultTxHost.tx
        .update(permissions)
        .set({ deletedAt: NOW })
        .where(and(eq(permissions.source, 'api'), isNull(permissions.deletedAt)));
      expect(await findUnsyncedPermissions(PERMISSION_REGISTRY)).toEqual(
        PERMISSION_REGISTRY.map((entry) => entry.key),
      );

      const first = await syncPermissions(PERMISSION_REGISTRY);
      expect(first.added).toEqual(PERMISSION_REGISTRY.map((entry) => entry.key));
      expect(first.rolesCreated).toEqual([]);
      expect(await findUnsyncedPermissions(PERMISSION_REGISTRY)).toEqual([]);

      expect(await syncPermissions(PERMISSION_REGISTRY)).toEqual({
        added: [],
        updated: [],
        retired: [],
        restored: [],
        rolesCreated: [],
      });
      const row = await apiPermission('users.read');
      expect(row).toMatchObject({
        label: 'Read users',
        groupName: 'users',
        source: 'api',
        createdBy: 'system',
      });
      expect(row.id).toMatch(UUID_V7);
    });
  });

  it('retires a key that left the registry (never deletes it), restores it when it returns, relabels', async () => {
    await inRolledBackSync(async () => {
      await syncPermissions([read, approve]);

      const retiredRun = await syncPermissions([read]);
      expect(retiredRun.retired).toEqual([approve.key]);
      expect((await apiPermission(approve.key)).retiredAt).not.toBeNull();
      expect(await findUnsyncedPermissions([read, approve])).toEqual([approve.key]);

      const relabelled = { ...approve, label: 'Approve things (renamed)' };
      const back = await syncPermissions([read, relabelled]);
      expect(back).toMatchObject({ restored: [approve.key], updated: [approve.key], retired: [] });
      expect(await apiPermission(approve.key)).toMatchObject({
        retiredAt: null,
        label: 'Approve things (renamed)',
      });
      expect(await findUnsyncedPermissions([read, approve])).toEqual([]);
    });
  });

  it('never touches menu permissions', async () => {
    await inRolledBackSync(async () => {
      const key = `menu.${group}`;
      await defaultTxHost.tx.insert(permissions).values({
        id: Bun.randomUUIDv7(),
        key,
        label: 'Reports',
        groupName: 'menu',
        source: 'menu',
        ...SYSTEM,
      });
      const before = await apiPermission(key);

      const result = await syncPermissions([read]);

      expect([
        ...result.added,
        ...result.updated,
        ...result.retired,
        ...result.restored,
      ]).not.toContain(key);
      expect(await apiPermission(key)).toEqual(before);
    });
  });

  it('recreates missing system roles (a project whose migrations setup regenerated)', async () => {
    await inRolledBackSync(async () => {
      await defaultTxHost.tx
        .update(roles)
        .set({ deletedAt: NOW })
        .where(inArray(roles.key, ['super_admin', 'user']));

      const result = await syncPermissions([read]);

      expect(result.rolesCreated).toEqual(SYSTEM_ROLES.map((role) => role.key));
      const live = await defaultTxHost.tx
        .select()
        .from(roles)
        .where(and(inArray(roles.key, ['super_admin', 'user']), isNull(roles.deletedAt)));
      expect(live.map((role) => [role.key, role.isSystem, role.createdBy]).sort()).toEqual([
        ['super_admin', true, 'system'],
        ['user', true, 'system'],
      ]);
    });
  });
});

/** A live role and API permissions of this test only (committed: unique keys, nothing shared). */
const insertRole = async (): Promise<string> => {
  const id = Bun.randomUUIDv7();
  await db.insert(roles).values({ id, key: unique('role'), name: 'Test role', ...SYSTEM });
  return id;
};
const insertPermission = async (): Promise<{ id: string; key: string }> => {
  const id = Bun.randomUUIDv7();
  const key = `${unique('perm')}.read`;
  await db
    .insert(permissions)
    .values({ id, key, label: key, groupName: 'test', source: 'api', ...SYSTEM });
  return { id, key };
};

describe('effective permissions (step 3)', () => {
  it('unites every live role and the live, unexpired grants; revocation and retirement remove them', async () => {
    const userId = await insertUser();
    const [staff, auditor] = [await insertRole(), await insertRole()];
    const [a, b, c, expired] = [
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
    ];
    await rbacService.mapPermission(staff, a.id);
    await rbacService.mapPermission(auditor, b.id);
    await rbacService.assignRole(userId, staff);
    await rbacService.assignRole(userId, auditor);
    await rbacService.grantPermission(userId, c.id, { expiresAt: nowInstant().add({ hours: 1 }) });
    // Expired already: written directly, the service refuses a past expiry.
    await db.insert(userPermissions).values({
      id: Bun.randomUUIDv7(),
      userId,
      permissionId: expired.id,
      expiresAt: nowInstant().subtract({ seconds: 1 }),
      ...SYSTEM,
    });

    const effective = await rbacService.getEffectivePermissions(userId);
    expect(effective).toEqual({ superAdmin: false, permissions: [a.key, b.key, c.key].sort() });
    expect(await cacheService.get<unknown>(CACHE_KEYS.userPermissions(userId))).toEqual(effective);

    await rbacService.revokeRole(userId, auditor);
    expect(await cacheService.get(CACHE_KEYS.userPermissions(userId))).toBeNull();
    await rbacService.revokePermission(userId, c.id);
    expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([a.key]);

    await db.update(permissions).set({ retiredAt: NOW }).where(eq(permissions.id, a.id));
    await cacheService.del(CACHE_KEYS.userPermissions(userId));
    expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([]);
  });

  it('records every revocation in record_changes (D53)', async () => {
    const userId = await insertUser();
    const role = await insertRole();
    const assignment = await rbacService.assignRole(userId, role);
    await rbacService.revokeRole(userId, role);

    const changes = await db
      .select()
      .from(recordChanges)
      .where(
        and(eq(recordChanges.tableName, 'user_roles'), eq(recordChanges.recordId, assignment.id)),
      );
    expect(changes.map((change) => change.action)).toEqual(['SOFT_DELETE']);
  });

  it('gives a super admin every permission and refuses to map that role', async () => {
    const userId = await insertUser();
    await rbacService.assignRole(userId, await roleId('super_admin'));

    expect(await rbacService.getEffectivePermissions(userId)).toEqual({
      superAdmin: true,
      permissions: [],
    });
    expect(await rbacService.hasPermission(userId, 'anything.read')).toBe(true);
    const permissionId = (await insertPermission()).id;
    expect(
      await rejectionOf(rbacService.mapPermission(await roleId('super_admin'), permissionId)),
    ).toBeInstanceOf(Error);
  });

  it('a change of a role drops the cached permissions of every holder', async () => {
    const [first, second] = [await insertUser(), await insertUser()];
    const role = await insertRole();
    const extra = await insertPermission();
    await rbacService.assignRole(first, role);
    await rbacService.assignRole(second, role);
    for (const userId of [first, second]) {
      expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([]);
    }

    await rbacService.mapPermission(role, extra.id);

    for (const userId of [first, second]) {
      expect(await cacheService.get(CACHE_KEYS.userPermissions(userId))).toBeNull();
      expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([extra.key]);
    }
    await rbacService.unmapPermission(role, extra.id);
    for (const userId of [first, second]) {
      expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([]);
    }
  });

  it('drops the cache after the commit: a read racing the open transaction cannot keep the old state (D63)', async () => {
    const userId = await insertUser();
    const role = await insertRole();
    const extra = await insertPermission();
    await rbacService.mapPermission(role, extra.id);
    await rbacService.assignRole(userId, role);

    await runInTransaction(async () => {
      await rbacService.revokeRole(userId, role);
      // Another request, outside this uncommitted transaction, still sees the role and caches it.
      const racing = await transactionStorage.exit(() =>
        rbacService.getEffectivePermissions(userId),
      );
      expect(racing.permissions).toEqual([extra.key]);
      expect(await cacheService.get<unknown>(CACHE_KEYS.userPermissions(userId))).toEqual(racing);
    });

    expect(await cacheService.get(CACHE_KEYS.userPermissions(userId))).toBeNull();
    expect((await rbacService.getEffectivePermissions(userId)).permissions).toEqual([]);
  });

  it('reads from the database while Redis is unavailable (fail-open)', async () => {
    const userId = await insertUser();
    const role = await insertRole();
    const extra = await insertPermission();
    await rbacService.mapPermission(role, extra.id);
    await rbacService.assignRole(userId, role);

    const offline = createRedisClient(redisConfig); // never connected: not ready
    try {
      const withoutRedis = new RbacService(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        new CacheService(offline),
      );
      expect(await withoutRedis.getEffectivePermissions(userId)).toEqual({
        superAdmin: false,
        permissions: [extra.key],
      });
      await withoutRedis.revokeRole(userId, role);
      expect((await withoutRedis.getEffectivePermissions(userId)).permissions).toEqual([]);
    } finally {
      await closeRedisClient(offline);
    }
  });
});

describe('routes check permissions per request (step 4a)', () => {
  const permissionId = async (key: string): Promise<string> => {
    const [row] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.key, key), isNull(permissions.deletedAt)));
    return row.id;
  };

  it('403 without the permission, 200 through a role or a grant, 403 again right after a revocation — same token', async () => {
    const app = createApp();
    const base = `${appConfig.API_BASE_PATH}/v1`;
    const userId = await insertUser();
    // The token's role claim authorizes nothing (it still says admin until step 4b).
    const { token } = await signAccessToken({ userId });
    const get = async (path: string): Promise<string> => {
      const res = await app.request(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { error?: { code: string } };
      return `${String(res.status)}${body.error ? ` ${body.error.code}` : ''}`;
    };

    expect(await get('/orders')).toBe('403 ERR_PERMISSION_FORBIDDEN');
    expect(await get('/projects')).toBe('403 ERR_PERMISSION_FORBIDDEN');

    const role = await insertRole();
    await rbacService.mapPermission(role, await permissionId('orders.read'));
    await rbacService.assignRole(userId, role);
    expect(await get('/orders')).toBe('200');

    await rbacService.grantPermission(userId, await permissionId('projects.read'));
    expect(await get('/projects')).toBe('200');

    await rbacService.revokeRole(userId, role);
    expect(await get('/orders')).toBe('403 ERR_PERMISSION_FORBIDDEN');
    await rbacService.revokePermission(userId, await permissionId('projects.read'));
    expect(await get('/projects')).toBe('403 ERR_PERMISSION_FORBIDDEN');

    // allowAnyUser(): no permission needed.
    expect(await get('/auth/me')).not.toStartWith('403');
  });

  it('a super admin passes every permission check', async () => {
    const app = createApp();
    const userId = await insertUser();
    await rbacService.assignRole(userId, await roleId('super_admin'));
    const { token } = await signAccessToken({ userId });

    const res = await app.request(`${appConfig.API_BASE_PATH}/v1/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});

describe('seed:admin gives the super_admin role (step 4a)', () => {
  it('a created admin, a promoted user and an earlier admin without the role all pass every check', async () => {
    const hash = (password: string) => Promise.resolve(`hashed:${password}`);
    const created = await seedAdmin(
      {
        email: `${unique('seed')}@example.com`,
        fullName: 'Admin',
        password: 'long enough',
        promote: false,
      },
      undefined,
      hash,
    );
    expect(created.action).toBe('created');
    expect((await rbacService.getEffectivePermissions(created.user.id)).superAdmin).toBe(true);

    const userId = await insertUser();
    const [{ email }] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const promoted = await seedAdmin(
      { email, fullName: 'x', promote: true },
      undefined,
      hash,
      (id) => cacheService.del(CACHE_KEYS.userPermissions(id)),
    );
    expect(promoted.action).toBe('promoted');
    expect((await rbacService.getEffectivePermissions(userId)).superAdmin).toBe(true);

    // Run again: nothing to do.
    expect(
      (await seedAdmin({ email, fullName: 'x', promote: false }, undefined, hash)).action,
    ).toBe('unchanged');
  });
});

describe('users start with the role user and show their roles (step 4b)', () => {
  it('a user created by an administrator holds exactly the role user; their roles follow the RBAC changes', async () => {
    const created = await asActor(() =>
      usersService.createUser({
        email: `${unique('new')}@example.com`,
        fullName: 'New User',
        password: 'long enough password',
      }),
    );
    expect(created.roles).toEqual(['user']);

    const role = await insertRole();
    await rbacService.assignRole(created.id, role);
    const [{ key }] = await db.select({ key: roles.key }).from(roles).where(eq(roles.id, role));
    expect((await usersService.getUserById(created.id)).roles).toEqual([key, 'user'].sort());
  });
});
