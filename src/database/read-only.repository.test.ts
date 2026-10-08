import { beforeEach, describe, expect, it } from 'bun:test';
import { asc, eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import { createSqlRecorder } from '../../test/helpers/sql-recorder';
import { RefRolesRepository } from '../../test/helpers/repository-fixtures';
import { refRoles } from './schema/reference/ref-roles.schema';

describe('ReadOnlyRepository', () => {
  const recorder = createSqlRecorder();
  const roles = new RefRolesRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('findPage reads the view with the required order and maps column types', async () => {
    recorder.respondWith([['admin', 'Administrator', null, '2026-10-05 10:00:00+07']]);

    const page = await roles.findPage({
      page: 2,
      perPage: 10,
      where: eq(refRoles.code, 'admin'),
      orderBy: [asc(refRoles.code)],
    });

    expect(page).toEqual([
      {
        code: 'admin',
        name: 'Administrator',
        description: null,
        createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
      },
    ]);
    expect(recorder.statements.at(0)).toEqual({
      sql: 'select "code", "name", "description", "created_at" from "reference"."ref_roles" where "ref_roles"."code" = $1 order by "ref_roles"."code" asc limit $2 offset $3',
      params: ['admin', 10, 10],
    });
  });

  it('count, with and without a filter', async () => {
    recorder.respondWith([[2]]);

    expect(await roles.count()).toBe(2);
    expect(await roles.count(eq(refRoles.code, 'x'))).toBe(0);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'select count(*) from "reference"."ref_roles"',
      'select count(*) from "reference"."ref_roles" where "ref_roles"."code" = $1',
    ]);
  });

  it('offers reads only', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(roles)));
    expect(methods.sort()).toEqual(['constructor', 'count', 'findPage']);
  });
});
