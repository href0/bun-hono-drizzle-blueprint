import { beforeEach, describe, expect, it } from 'bun:test';
import { runWithRequestContext, type RequestContext } from '../../core/context/request-context';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { PermissionEndpoints } from '../../core/security/rbac';
import type { Permission } from '../../database/schema';
import { runInFakeTransaction } from '../../database/transaction-host';
import type { RbacPermissionsRepository } from './rbac-permissions.repository';
import { RbacPermissionsService } from './rbac-permissions.service';
import type { RbacService } from './rbac.service';

const api = (key: string): Permission =>
  ({ id: `perm-${key}`, key, source: 'api', groupName: key.split('.')[0] }) as Permission;
const menu = (key: string): Permission =>
  ({ id: `perm-${key}`, key, source: 'menu', groupName: 'menus' }) as Permission;

const ENDPOINTS: PermissionEndpoints = new Map([
  ['orders.read', [{ method: 'GET', path: '/api/v1/orders', summary: 'List orders' }]],
]);

/** A request whose context carries the endpoint catalog (as `permissionContext()` sets it). */
const inRequest = <T>(fn: () => Promise<T>): Promise<T> => {
  const context: RequestContext = {
    requestId: 'r1',
    locale: 'en',
    clientIp: 'unknown',
    actor: 'user:u1',
    user: { id: 'u1' },
    permissionEndpoints: () => Promise.resolve(ENDPOINTS),
  };
  return runWithRequestContext(context, () => runInFakeTransaction({}, fn));
};
const inTx = <T>(fn: () => Promise<T>): Promise<T> => runInFakeTransaction({}, fn);

const errorOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );
const unique = () => Promise.reject(Object.assign(new Error('dup'), { code: '23505' }));

describe('RbacPermissionsService', () => {
  let repo: Record<string, unknown>;
  let forgotten: string[][];
  const service = () =>
    new RbacPermissionsService(
      repo as unknown as RbacPermissionsRepository,
      {
        forget: (ids: readonly string[]) => {
          forgotten.push([...ids]);
          return Promise.resolve();
        },
      } as unknown as RbacService,
    );

  beforeEach(() => {
    forgotten = [];
    const rows = new Map([api('orders.read'), menu('menu.reports')].map((p) => [p.id, p]));
    repo = {
      findPermissionList: () => Promise.resolve({ rows: [...rows.values()], total: 2 }),
      findById: (id: string) => Promise.resolve(rows.get(id) ?? null),
      findIncludingDeleted: (id: string) => Promise.resolve(rows.get(id) ?? null),
      create: (input: object) => Promise.resolve({ id: 'perm-new', ...input }),
      updateById: (id: string, patch: object) => Promise.resolve({ ...rows.get(id), ...patch }),
      softDeleteById: () => Promise.resolve({}),
      restoreById: (id: string) => Promise.resolve(rows.get(id) ?? null),
      findHolderIds: () => Promise.resolve(['u1']),
    };
  });

  it('lists permissions with the endpoints of API permissions (menus: none)', async () => {
    const { permissions, total } = await inRequest(() => service().listPermissions({} as never));
    expect(total).toBe(2);
    expect(permissions.map(({ key, endpoints }) => [key, endpoints.length])).toEqual([
      ['orders.read', 1],
      ['menu.reports', 0],
    ]);
  });

  it('outside a request (no catalog) the endpoints are empty; an unknown id is a 404', async () => {
    expect((await service().getPermission('perm-orders.read')).endpoints).toEqual([]);
    expect(
      (await inRequest(() => service().getPermission('perm-orders.read'))).endpoints,
    ).toHaveLength(1);
    expect(await errorOf(service().getPermission('perm-x'))).toBeInstanceOf(NotFoundError);
  });

  it('creates a menu permission (source menu, group into group_name); a taken key is a 409', async () => {
    const created = await inTx(() =>
      service().createMenuPermission({ key: 'menu.sales', label: 'Sales', group: 'menus' }),
    );
    expect(created).toMatchObject({
      key: 'menu.sales',
      source: 'menu',
      groupName: 'menus',
      endpoints: [],
    });

    repo.create = unique;
    expect(
      await errorOf(
        inTx(() => service().createMenuPermission({ key: 'menu.sales', label: 'S', group: 'g' })),
      ),
    ).toBeInstanceOf(ConflictError);
    repo.create = () => Promise.reject(new Error('boom'));
    expect(
      (
        (await errorOf(
          inTx(() => service().createMenuPermission({ key: 'menu.sales', label: 'S', group: 'g' })),
        )) as Error
      ).message,
    ).toBe('boom');
  });

  it('updates only menu permissions (label, group); an API permission is a 409', async () => {
    const updated = await inTx(() =>
      service().updateMenuPermission('perm-menu.reports', { label: 'Reports', group: 'main' }),
    );
    expect(updated).toMatchObject({ label: 'Reports', groupName: 'main' });
    const labelOnly = await inTx(() =>
      service().updateMenuPermission('perm-menu.reports', { label: 'Only label' }),
    );
    expect(labelOnly.groupName).toBe('menus');

    expect(
      await errorOf(inTx(() => service().updateMenuPermission('perm-orders.read', { label: 'x' }))),
    ).toBeInstanceOf(ConflictError);
    repo.updateById = () => Promise.resolve(null);
    expect(
      await errorOf(
        inTx(() => service().updateMenuPermission('perm-menu.reports', { group: 'x' })),
      ),
    ).toBeInstanceOf(NotFoundError);
  });

  it('deletes a menu permission and drops its holders’ cache; API permissions stay', async () => {
    await inTx(() => service().deleteMenuPermission('perm-menu.reports'));
    expect(forgotten).toEqual([['u1']]);
    expect(
      await errorOf(inTx(() => service().deleteMenuPermission('perm-orders.read'))),
    ).toBeInstanceOf(ConflictError);
    repo.softDeleteById = () => Promise.resolve(null);
    expect(
      await errorOf(inTx(() => service().deleteMenuPermission('perm-menu.reports'))),
    ).toBeInstanceOf(NotFoundError);
  });

  it('restores a menu permission and drops its holders’ cache', async () => {
    const restored = await inTx(() => service().restoreMenuPermission('perm-menu.reports'));
    expect(restored.endpoints).toEqual([]);
    expect(forgotten).toEqual([['u1']]);
  });

  it('a restore of an unknown, live or API permission, or onto a taken key, is refused', async () => {
    expect(await errorOf(inTx(() => service().restoreMenuPermission('perm-x')))).toBeInstanceOf(
      NotFoundError,
    );
    expect(
      await errorOf(inTx(() => service().restoreMenuPermission('perm-orders.read'))),
    ).toBeInstanceOf(ConflictError);
    repo.restoreById = unique;
    expect(
      await errorOf(inTx(() => service().restoreMenuPermission('perm-menu.reports'))),
    ).toBeInstanceOf(ConflictError);
    repo.restoreById = () => Promise.reject(new Error('boom'));
    expect(
      ((await errorOf(inTx(() => service().restoreMenuPermission('perm-menu.reports')))) as Error)
        .message,
    ).toBe('boom');
    repo.restoreById = () => Promise.resolve(null);
    expect(
      await errorOf(inTx(() => service().restoreMenuPermission('perm-menu.reports'))),
    ).toBeInstanceOf(NotFoundError);
  });
});
