import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { existsSync, readFileSync } from 'node:fs';
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
  rolePermissions,
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
import { rbacRolesService } from '../../src/modules/rbac/rbac-roles.service';
import { RbacService, rbacService } from '../../src/modules/rbac/rbac.service';
import { usersService } from '../../src/modules/users/users.service';
import { PERMISSION_REGISTRY } from '../../src/permissions';
import { nowInstant, parseInstant, toIsoUtc } from '../../src/utils/datetime.util';
import { asActor, rejectionOf, unique } from '../helpers/integration';
import { runWithRequestContext } from '../../src/core/context/request-context';
import { ConflictError } from '../../src/core/errors';

/**
 * The RBAC tables on a real PostgreSQL (D55, D58): the system roles and the move of
 * `users.role` into `user_roles` written by migration 0010, and the constraints the schema
 * declares (partial uniques, the permission source / `menu.` prefix CHECKs, RESTRICT foreign keys);
 * the sync of the permission registry (D48), each test in a transaction that is rolled back; and
 * the effective permissions with their cache and invalidation (D52, D53) on a real PostgreSQL + Redis.
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

// The move of the old users.role column is the boilerplate's history: `bun run setup` regenerates the
// migrations from scratch (one 0000, no users.role ever), so a new project has no 0010 to replay.
describe.skipIf(!existsSync(MIGRATION))('migration 0010: users.role → user_roles', () => {
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

describe('permission registry sync (D48, D67)', () => {
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

describe('effective permissions (D52, D53)', () => {
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

  it('replacing the permissions of a role writes only the difference; mappings of a deleted permission stay (D72)', async () => {
    const role = await insertRole();
    const [kept, dropped, added] = [
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
    ];
    const keptMapping = await rbacService.mapPermission(role, kept.id);
    const droppedMapping = await rbacService.mapPermission(role, dropped.id);
    // A deleted menu permission: invisible to the checklist, its mapping waits for a restore.
    const menuId = Bun.randomUUIDv7();
    await db.insert(permissions).values({
      id: menuId,
      key: `menu.${unique('m')}`,
      label: 'Menu',
      groupName: 'menus',
      source: 'menu',
      ...SYSTEM,
    });
    const menuMapping = await rbacService.mapPermission(role, menuId);
    await db.update(permissions).set({ deletedAt: NOW }).where(eq(permissions.id, menuId));
    const auditOf = async (recordId: string) =>
      (
        await db
          .select({ action: recordChanges.action })
          .from(recordChanges)
          .where(
            and(
              eq(recordChanges.tableName, 'role_permissions'),
              eq(recordChanges.recordId, recordId),
            ),
          )
      ).map(({ action }) => action);
    const keptAudit = await auditOf(keptMapping.id);

    const change = await rbacService.replaceRolePermissions(role, [kept.id, added.id]);
    expect(change).toMatchObject({
      added: [{ id: added.id, key: added.key }],
      removed: [{ id: dropped.id, key: dropped.key }],
      unchanged: [{ id: kept.id, key: kept.key }],
    });

    const live = await db
      .select({ id: rolePermissions.id, permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, role), isNull(rolePermissions.deletedAt)));
    expect(live.map(({ permissionId }) => permissionId).sort()).toEqual(
      [kept.id, added.id, menuId].sort(),
    );
    // The kept mapping is the same row, with no new audit entry; the dropped one is soft-deleted.
    expect(live.find(({ permissionId }) => permissionId === kept.id)?.id).toBe(keptMapping.id);
    expect(await auditOf(keptMapping.id)).toEqual(keptAudit);
    expect((await auditOf(droppedMapping.id)).at(-1)).toBe('SOFT_DELETE');
    expect(live.find(({ permissionId }) => permissionId === menuId)?.id).toBe(menuMapping.id);

    // The same set again: nothing written.
    const again = await rbacService.replaceRolePermissions(role, [added.id, kept.id]);
    expect([again.added, again.removed]).toEqual([[], []]);
  });

  it('replacing the roles of a user writes only the difference; assignments of a deleted role stay (D72)', async () => {
    const userId = await insertUser();
    const [kept, dropped, added, deleted] = [
      await insertRole(),
      await insertRole(),
      await insertRole(),
      await insertRole(),
    ];
    const keptAssignment = await rbacService.assignRole(userId, kept);
    await rbacService.assignRole(userId, dropped);
    const deletedAssignment = await rbacService.assignRole(userId, deleted);
    await db.update(roles).set({ deletedAt: NOW }).where(eq(roles.id, deleted));

    const change = await rbacService.replaceUserRoles(userId, [kept, added]);
    expect(
      [change.added, change.removed, change.unchanged].map((items) => items.map(({ id }) => id)),
    ).toEqual([[added], [dropped], [kept]]);
    const live = await db
      .select({ id: userRoles.id, roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), isNull(userRoles.deletedAt)));
    expect(live.map(({ roleId }) => roleId).sort()).toEqual([kept, added, deleted].sort());
    expect(live.find(({ roleId }) => roleId === kept)?.id).toBe(keptAssignment.id);
    expect(live.find(({ roleId }) => roleId === deleted)?.id).toBe(deletedAssignment.id);

    const again = await rbacService.replaceUserRoles(userId, [added, kept]);
    expect([again.added, again.removed]).toEqual([[], []]);
  });

  it('replacing the grants of a user: created, updated, revoked, kept untouched — expired kept as is (D72)', async () => {
    const userId = await insertUser();
    const [kept, changed, dropped, added, expired] = [
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
    ];
    const keptGrant = await rbacService.grantPermission(userId, kept.id);
    const changedGrant = await rbacService.grantPermission(userId, changed.id, { note: 'old' });
    await rbacService.grantPermission(userId, dropped.id);
    const expiredGrantId = Bun.randomUUIDv7();
    // Microseconds, as PostgreSQL keeps them; the API sends milliseconds.
    const PAST = Temporal.Instant.fromEpochNanoseconds(
      BigInt(nowInstant().subtract({ hours: 1 }).epochMilliseconds) * 1_000_000n + 456_000n,
    );
    await db.insert(userPermissions).values({
      id: expiredGrantId,
      userId,
      permissionId: expired.id,
      expiresAt: PAST,
      note: 'audit',
      ...SYSTEM,
    });
    const until = nowInstant().add({ hours: 24 }).round({ smallestUnit: 'millisecond' });

    const change = await rbacService.replaceUserGrants(userId, [
      { permissionId: kept.id },
      { permissionId: changed.id, note: 'new' },
      { permissionId: added.id, expiresAt: until },
      // As read from GET /users/:id/permissions (milliseconds on the wire).
      {
        permissionId: expired.id,
        expiresAt: parseInstant(toIsoUtc(PAST)),
        note: 'audit',
      },
    ]);
    expect(
      [change.added, change.updated, change.removed, change.unchanged].map((items) =>
        items.map(({ id }) => id).sort(),
      ),
    ).toEqual([[added.id], [changed.id], [dropped.id], [kept.id, expired.id].sort()]);

    const live = await db
      .select()
      .from(userPermissions)
      .where(and(eq(userPermissions.userId, userId), isNull(userPermissions.deletedAt)));
    const byPermission = new Map(live.map((row) => [row.permissionId, row]));
    expect([...byPermission.keys()].sort()).toEqual(
      [kept.id, changed.id, added.id, expired.id].sort(),
    );
    expect(byPermission.get(kept.id)?.id).toBe(keptGrant.id);
    expect(byPermission.get(changed.id)).toMatchObject({ id: changedGrant.id, note: 'new' });
    expect(byPermission.get(added.id)?.expiresAt?.toString()).toBe(until.toString());
    expect(byPermission.get(expired.id)?.id).toBe(expiredGrantId);
  });

  it('the role checklist: grantable when the caller holds what the role gives — retired and deleted permissions aside (D73)', async () => {
    const role = await insertRole();
    const [held, retired, deleted] = [
      await insertPermission(),
      await insertPermission(),
      await insertPermission(),
    ];
    for (const { id } of [held, retired, deleted]) await rbacService.mapPermission(role, id);
    await db.update(permissions).set({ retiredAt: NOW }).where(eq(permissions.id, retired.id));
    await db.update(permissions).set({ deletedAt: NOW }).where(eq(permissions.id, deleted.id));

    const asHolder = (keys: string[]) =>
      runWithRequestContext(
        {
          requestId: 'r-options',
          locale: 'en',
          clientIp: '127.0.0.1',
          actor: 'user:checklist-admin',
          user: { id: Bun.randomUUIDv7() },
          permissions: () => Promise.resolve({ superAdmin: false, permissions: keys }),
        },
        () => rbacRolesService.listRoleOptions(),
      );
    const grantableOf = (options: Awaited<ReturnType<typeof asHolder>>) =>
      options.find((option) => option.role.id === role)?.grantable;

    expect(grantableOf(await asHolder([held.key]))).toBe(true);
    expect(grantableOf(await asHolder([]))).toBe(false);
    const all = await asHolder([held.key]);
    expect(all.map(({ role: { key } }) => key)).toEqual(all.map(({ role: { key } }) => key).sort());
    expect(all.find(({ role: { key } }) => key === 'super_admin')?.grantable).toBe(false);
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

describe('routes check permissions per request (D49, D53)', () => {
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
    // The token carries no permission: it authorizes nothing by itself (D53).
    const { token } = await signAccessToken({ userId });
    const get = async (path: string): Promise<string> => {
      const res = await app.request(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { error?: { code: string } };
      return `${String(res.status)}${body.error ? ` ${body.error.code}` : ''}`;
    };

    expect(await get('/users')).toBe('403 ERR_PERMISSION_FORBIDDEN');
    expect(await get('/roles')).toBe('403 ERR_PERMISSION_FORBIDDEN');

    const role = await insertRole();
    await rbacService.mapPermission(role, await permissionId('users.read'));
    await rbacService.assignRole(userId, role);
    expect(await get('/users')).toBe('200');

    await rbacService.grantPermission(userId, await permissionId('roles.read'));
    expect(await get('/roles')).toBe('200');

    await rbacService.revokeRole(userId, role);
    expect(await get('/users')).toBe('403 ERR_PERMISSION_FORBIDDEN');
    await rbacService.revokePermission(userId, await permissionId('roles.read'));
    expect(await get('/roles')).toBe('403 ERR_PERMISSION_FORBIDDEN');

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

describe('seed:admin gives the super_admin role (D58)', () => {
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

describe('users start with the role user and show their roles (D59)', () => {
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

describe('admin API: roles and permissions (D68, D69)', () => {
  const base = `${appConfig.API_BASE_PATH}/v1`;
  const keyId = async (key: string): Promise<string> => {
    const [row] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.key, key), isNull(permissions.deletedAt)));
    return row.id;
  };

  interface Answer {
    status: number;
    code?: string;
    data?: unknown;
    meta?: { total_items: number };
  }

  /** Calls the real app (database lookup, cache) as `userId`. */
  const caller = async (userId: string) => {
    const app = createApp();
    const { token } = await signAccessToken({ userId });
    return async (method: string, route: string, body?: unknown): Promise<Answer> => {
      const res = await app.request(`${base}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = (await res.json()) as Omit<Answer, 'status'> & { error?: { code: string } };
      return { status: res.status, code: json.error?.code, data: json.data, meta: json.meta };
    };
  };

  const superAdmin = async () => {
    const userId = await insertUser();
    await rbacService.assignRole(userId, await roleId('super_admin'));
    return caller(userId);
  };

  it('role lifecycle: create, list, update, map, delete and restore — holders follow at once, every change audited', async () => {
    const call = await superAdmin();
    const key = unique('staff').replaceAll('-', '_');

    const created = await call('POST', '/roles', { key, name: 'Staff' });
    expect(created.status).toBe(201);
    const id = (created.data as { id: string }).id;
    expect((await call('POST', '/roles', { key, name: 'Again' })).status).toBe(409);

    const listed = await call('GET', `/roles?q=${key}&is_system=false`);
    expect(listed.meta?.total_items).toBe(1);
    expect((await call('PATCH', `/roles/${id}`, { name: 'Staff 2' })).data).toMatchObject({
      name: 'Staff 2',
      key,
    });

    const usersRead = await keyId('users.read');
    expect((await call('PUT', `/roles/${id}/permissions/${usersRead}`)).status).toBe(201);
    expect((await call('PUT', `/roles/${id}/permissions/${usersRead}`)).status).toBe(200);
    const mapped = (await call('GET', `/roles/${id}/permissions`)).data as {
      key: string;
      endpoints: { method: string; path: string }[];
    }[];
    expect(mapped.map(({ key: k }) => k)).toEqual(['users.read']);
    expect(mapped[0]?.endpoints).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: `${base}/users`, summary: expect.any(String) },
      ]),
    );

    // A holder of the role reads users; deleting the role takes it away on the next request.
    const holderId = await insertUser();
    await rbacService.assignRole(holderId, id);
    const holder = await caller(holderId);
    expect((await holder('GET', '/users')).status).toBe(200);
    expect((await call('DELETE', `/roles/${id}`)).status).toBe(200);
    expect((await holder('GET', '/users')).code).toBe('ERR_PERMISSION_FORBIDDEN');
    expect((await call('POST', `/roles/${id}/restore`)).status).toBe(200);
    expect((await holder('GET', '/users')).status).toBe(200);

    expect((await call('DELETE', `/roles/${id}/permissions/${usersRead}`)).status).toBe(200);
    expect((await holder('GET', '/users')).code).toBe('ERR_PERMISSION_FORBIDDEN');

    const changes = await db
      .select({ action: recordChanges.action })
      .from(recordChanges)
      .where(and(eq(recordChanges.tableName, 'roles'), eq(recordChanges.recordId, id)));
    expect(changes.map(({ action }) => action).sort()).toEqual([
      'RESTORE',
      'SOFT_DELETE',
      'UPDATE',
    ]);
  });

  it('protects the system roles: super_admin is fixed, system roles are not deleted', async () => {
    const call = await superAdmin();
    const root = await roleId('super_admin');
    const plain = await roleId('user');

    expect((await call('PATCH', `/roles/${root}`, { name: 'Root' })).status).toBe(409);
    expect((await call('DELETE', `/roles/${root}`)).status).toBe(409);
    expect((await call('DELETE', `/roles/${plain}`)).status).toBe(409);
    const usersRead = await keyId('users.read');
    expect((await call('PUT', `/roles/${root}/permissions/${usersRead}`)).status).toBe(409);
    // super_admin holds every permission that counts.
    const all = (await call('GET', `/roles/${root}/permissions`)).data as { key: string }[];
    expect(all.map(({ key }) => key)).toEqual(
      expect.arrayContaining(['users.read', 'roles.update']),
    );
  });

  it('no escalation: an administrator gives only what they hold — by mapping, or by restoring a role', async () => {
    const admins = await insertRole();
    for (const key of [
      'roles.read',
      'roles.update',
      'roles.restore',
      'roles.delete',
      'users.read',
    ]) {
      await rbacService.mapPermission(admins, await keyId(key));
    }
    const adminId = await insertUser();
    await rbacService.assignRole(adminId, admins);
    const call = await caller(adminId);
    const target = await insertRole();

    expect(
      (await call('PUT', `/roles/${target}/permissions/${await keyId('users.read')}`)).status,
    ).toBe(201);
    const refused = await call(
      'PUT',
      `/roles/${target}/permissions/${await keyId('users.delete')}`,
    );
    expect(refused).toMatchObject({ status: 403, code: 'ERR_PERMISSION_ESCALATION_FORBIDDEN' });

    // A role holding users.delete (mapped by the system), deleted: restoring it would give it back.
    const powerful = await insertRole();
    await rbacService.mapPermission(powerful, await keyId('users.delete'));
    expect((await call('DELETE', `/roles/${powerful}`)).status).toBe(200);
    expect((await call('POST', `/roles/${powerful}/restore`)).code).toBe(
      'ERR_PERMISSION_ESCALATION_FORBIDDEN',
    );
  });

  it('menu permissions: created, listed, changed and deleted by an admin — holders follow; API permissions stay fixed', async () => {
    const call = await superAdmin();
    const key = `menu.${unique('reports')}`;

    const created = await call('POST', '/permissions', { key, label: 'Reports', group: 'menus' });
    expect(created.status).toBe(201);
    const id = (created.data as { id: string }).id;
    expect(
      (await call('POST', '/permissions', { key, label: 'Again', group: 'menus' })).status,
    ).toBe(409);
    expect((await call('GET', `/permissions?source=menu&q=${key}`)).meta?.total_items).toBe(1);
    expect(
      (await call('PATCH', `/permissions/${id}`, { label: 'Monthly reports' })).data,
    ).toMatchObject({
      label: 'Monthly reports',
      source: 'menu',
      endpoints: [],
    });

    const role = await insertRole();
    await rbacService.mapPermission(role, id);
    const holderId = await insertUser();
    await rbacService.assignRole(holderId, role);
    expect((await rbacService.getEffectivePermissions(holderId)).permissions).toContain(key);

    expect((await call('DELETE', `/permissions/${id}`)).status).toBe(200);
    expect((await rbacService.getEffectivePermissions(holderId)).permissions).not.toContain(key);
    expect((await call('POST', `/permissions/${id}/restore`)).status).toBe(200);
    expect((await rbacService.getEffectivePermissions(holderId)).permissions).toContain(key);

    const usersRead = await keyId('users.read');
    expect((await call('PATCH', `/permissions/${usersRead}`, { label: 'x' })).status).toBe(409);
    expect((await call('DELETE', `/permissions/${usersRead}`)).status).toBe(409);
  });

  it('lists API permissions with the endpoints they open, filtered and counted in SQL', async () => {
    const call = await superAdmin();
    const page = await call('GET', '/permissions?source=api&retired=false&group=roles&sort=key');
    const rows = page.data as { key: string; endpoints: unknown[] }[];
    expect(rows.map(({ key }) => key)).toEqual([
      'roles.create',
      'roles.delete',
      'roles.read',
      'roles.restore',
      'roles.update',
    ]);
    expect(page.meta?.total_items).toBe(5);
    expect(rows.every(({ endpoints }) => endpoints.length > 0)).toBe(true);
  });
});

describe('user access (D68, D69)', () => {
  const base = `${appConfig.API_BASE_PATH}/v1`;
  const keyId = async (key: string): Promise<string> => {
    const [row] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.key, key), isNull(permissions.deletedAt)));
    return row.id;
  };

  /** Calls the real app (database lookup, cache) as `userId`: status and error code (or data). */
  const caller = async (userId: string) => {
    const app = createApp();
    const { token } = await signAccessToken({ userId });
    return async (
      method: string,
      route: string,
      body?: unknown,
    ): Promise<{ status: number; code?: string; data?: unknown }> => {
      const res = await app.request(`${base}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = (await res.json()) as { data?: unknown; error?: { code: string } };
      return { status: res.status, code: json.error?.code, data: json.data };
    };
  };
  const newSuperAdmin = async (): Promise<string> => {
    const userId = await insertUser();
    await rbacService.assignRole(userId, await roleId('super_admin'));
    return userId;
  };

  it('roles and extra permissions of a user: given, listed, changed and revoked — the user follows on the next request', async () => {
    const admin = await caller(await newSuperAdmin());
    const userId = await insertUser();
    const user = await caller(userId);
    const readers = await insertRole();
    await rbacService.mapPermission(readers, await keyId('users.read'));

    expect((await user('GET', '/users')).code).toBe('ERR_PERMISSION_FORBIDDEN');
    expect((await admin('PUT', `/users/${userId}/roles/${readers}`)).status).toBe(201);
    expect((await admin('PUT', `/users/${userId}/roles/${readers}`)).status).toBe(200);
    expect((await user('GET', '/users')).status).toBe(200);
    const roleKeys = ((await admin('GET', `/users/${userId}/roles`)).data as { key: string }[]).map(
      ({ key }) => key,
    );
    // insertUser() writes the row directly: the only role is the one just given.
    expect(roleKeys).toHaveLength(1);
    expect((await admin('DELETE', `/users/${userId}/roles/${readers}`)).status).toBe(200);
    expect((await user('GET', '/users')).code).toBe('ERR_PERMISSION_FORBIDDEN');

    const usersRead = await keyId('users.read');
    const later = nowInstant().add({ hours: 2 }).toString();
    expect(
      (await admin('PUT', `/users/${userId}/permissions/${usersRead}`, { expires_at: later }))
        .status,
    ).toBe(201);
    expect((await user('GET', '/users')).status).toBe(200);
    expect(
      (await admin('PUT', `/users/${userId}/permissions/${usersRead}`, { note: 'audit' })).status,
    ).toBe(200);
    expect((await admin('GET', `/users/${userId}/permissions`)).data).toMatchObject([
      { note: 'audit', expires_at: null, permission: { key: 'users.read' } },
    ]);
    expect(
      (
        await admin('PUT', `/users/${userId}/permissions/${usersRead}`, {
          expires_at: '2000-01-01T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect((await admin('DELETE', `/users/${userId}/permissions/${usersRead}`)).status).toBe(200);
    expect((await user('GET', '/users')).code).toBe('ERR_PERMISSION_FORBIDDEN');

    // /me/permissions: every signed-in user, read per request.
    const mine = (await user('GET', '/me/permissions')).data as { permissions: string[] };
    expect(mine.permissions).not.toContain('users.read');
  });

  it('no escalation: an administrator gives only roles and permissions they hold, and never super_admin', async () => {
    const admins = await insertRole();
    for (const key of ['user-roles.create', 'user-permissions.create', 'users.read']) {
      await rbacService.mapPermission(admins, await keyId(key));
    }
    const adminId = await insertUser();
    await rbacService.assignRole(adminId, admins);
    const admin = await caller(adminId);
    const target = await insertUser();

    const readers = await insertRole();
    await rbacService.mapPermission(readers, await keyId('users.read'));
    const deleters = await insertRole();
    await rbacService.mapPermission(deleters, await keyId('users.delete'));

    expect((await admin('PUT', `/users/${target}/roles/${readers}`)).status).toBe(201);
    for (const route of [
      `/users/${target}/roles/${deleters}`,
      `/users/${target}/roles/${await roleId('super_admin')}`,
      // An admin cannot raise themselves either.
      `/users/${adminId}/roles/${await roleId('super_admin')}`,
    ]) {
      expect((await admin('PUT', route)).code).toBe('ERR_PERMISSION_ESCALATION_FORBIDDEN');
    }
    expect(
      (await admin('PUT', `/users/${target}/permissions/${await keyId('users.read')}`, {})).status,
    ).toBe(201);
    expect(
      (await admin('PUT', `/users/${target}/permissions/${await keyId('users.delete')}`, {})).code,
    ).toBe('ERR_PERMISSION_ESCALATION_FORBIDDEN');
  });

  it('super_admin: never taken from oneself, nor from the last active holder', async () => {
    const selfId = await newSuperAdmin();
    const me = await caller(selfId);
    const superAdminRole = await roleId('super_admin');
    expect((await me('DELETE', `/users/${selfId}/roles/${superAdminRole}`)).code).toBe(
      'ERR_SELF_LOCKOUT_FORBIDDEN',
    );

    // Another super admin may take it — while someone else can still sign in as super admin.
    const other = await caller(await newSuperAdmin());
    expect((await other('DELETE', `/users/${selfId}/roles/${superAdminRole}`)).status).toBe(200);

    // The last active holder: every other holder deactivated, inside a transaction rolled back.
    const lastId = await newSuperAdmin();
    await inRolledBackSync(async () => {
      await defaultTxHost.tx
        .update(users)
        .set({ isActive: false })
        .where(
          inArray(
            users.id,
            db
              .select({ id: userRoles.userId })
              .from(userRoles)
              .where(and(eq(userRoles.roleId, superAdminRole), isNull(userRoles.deletedAt))),
          ),
        );
      await defaultTxHost.tx.update(users).set({ isActive: true }).where(eq(users.id, lastId));
      const error = await rejectionOf(
        runWithRequestContext(
          {
            requestId: 'int-6b',
            locale: 'en',
            clientIp: '127.0.0.1',
            actor: 'user:0192f1d0-0000-7000-8000-00000000beef',
            user: { id: '0192f1d0-0000-7000-8000-00000000beef' },
            permissions: () => Promise.resolve({ superAdmin: true, permissions: [] }),
          },
          () => rbacService.revokeRole(lastId, superAdminRole),
        ),
      );
      expect(error).toBeInstanceOf(ConflictError);
    });
  });
});

describe('accounts never go round RBAC (D69)', () => {
  const base = `${appConfig.API_BASE_PATH}/v1`;
  const keyId = async (key: string): Promise<string> => {
    const [row] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.key, key), isNull(permissions.deletedAt)));
    return row.id;
  };
  const caller = async (userId: string) => {
    const app = createApp();
    const { token } = await signAccessToken({ userId });
    return async (method: string, route: string, body?: unknown): Promise<string> => {
      const res = await app.request(`${base}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = (await res.json()) as { error?: { code: string } };
      return `${String(res.status)}${json.error ? ` ${json.error.code}` : ''}`;
    };
  };

  it('an account administrator changes only accounts holding no more than they do', async () => {
    const admins = await insertRole();
    for (const key of ['users.read', 'users.update', 'users.delete']) {
      await rbacService.mapPermission(admins, await keyId(key));
    }
    const adminId = await insertUser();
    await rbacService.assignRole(adminId, admins);
    const admin = await caller(adminId);

    const rootId = await insertUser();
    await rbacService.assignRole(rootId, await roleId('super_admin'));
    const plainId = await insertUser();

    const password = { password: 'a new password 1' };
    expect(await admin('PUT', `/users/${rootId}/password`, password)).toBe(
      '403 ERR_PERMISSION_ESCALATION_FORBIDDEN',
    );
    expect(await admin('PATCH', `/users/${rootId}`, { is_active: false })).toBe(
      '403 ERR_PERMISSION_ESCALATION_FORBIDDEN',
    );
    expect(await admin('DELETE', `/users/${rootId}`)).toBe(
      '403 ERR_PERMISSION_ESCALATION_FORBIDDEN',
    );
    expect(await admin('PUT', `/users/${plainId}/password`, password)).toBe('200');
  });

  it('the last active super admin is never deleted or deactivated', async () => {
    const superAdminRole = await roleId('super_admin');
    const lastId = await insertUser();
    await rbacService.assignRole(lastId, superAdminRole);
    await inRolledBackSync(async () => {
      // Every other holder deactivated: lastId is the only one who can still sign in.
      await defaultTxHost.tx
        .update(users)
        .set({ isActive: false })
        .where(
          inArray(
            users.id,
            db
              .select({ id: userRoles.userId })
              .from(userRoles)
              .where(and(eq(userRoles.roleId, superAdminRole), isNull(userRoles.deletedAt))),
          ),
        );
      await defaultTxHost.tx.update(users).set({ isActive: true }).where(eq(users.id, lastId));
      const asRoot = <T>(fn: () => Promise<T>) =>
        runWithRequestContext(
          {
            requestId: 'int-8b',
            locale: 'en',
            clientIp: '127.0.0.1',
            actor: 'user:0192f1d0-0000-7000-8000-00000000beef',
            user: { id: '0192f1d0-0000-7000-8000-00000000beef' },
            permissions: () => Promise.resolve({ superAdmin: true, permissions: [] }),
            permissionsOf: (id: string) => rbacService.getEffectivePermissions(id),
          },
          fn,
        );
      expect(await rejectionOf(asRoot(() => usersService.deleteUser(lastId)))).toBeInstanceOf(
        ConflictError,
      );
      expect(
        await rejectionOf(asRoot(() => usersService.updateUser(lastId, { isActive: false }))),
      ).toBeInstanceOf(ConflictError);
    });
  });
});
