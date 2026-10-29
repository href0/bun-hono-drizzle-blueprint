import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { ProjectsRepository } from './projects.repository';
import { projects, type Project } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

const COLUMNS =
  '"id", "name", "is_active", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';

describe('ProjectsRepository (Unit)', () => {
  const sample: Project = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    name: 'Sample',
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
  };

  const recorder = createSqlRecorder();
  const repository = new ProjectsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads live rows of its table', async () => {
    recorder.respondWith([rowOf(projects, sample)]);

    expect(await repository.findById(sample.id)).toEqual(sample);
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "projects" where ("projects"."deleted_at" is null and "projects"."id" = $1) limit $2`,
        params: [sample.id, 1],
      },
    ]);
  });

  it('creates rows stamped with the actor', async () => {
    recorder.respondWith([rowOf(projects, sample)]);

    expect(await repository.create({ name: sample.name })).toEqual(sample);
    expect(recorder.statements.at(0)?.sql).toStartWith('insert into "projects"');
    expect(recorder.statements.at(0)?.params).toContain('system');
  });

  it('lists by the allowlist: sort, q and filters on the page and the total', async () => {
    recorder.respondWith([rowOf(projects, sample)], [[1]]);

    const result = await repository.findProjectList({
      page: 1,
      perPage: 10,
      sort: [{ field: 'name', direction: 'asc' }],
      q: 'sam',
      isActive: true,
    });

    expect(result).toEqual({ rows: [sample], total: 1 });
    const where = `where ("projects"."deleted_at" is null and ("projects"."name" ilike $1 and "projects"."is_active" = $2))`;
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      `select ${COLUMNS} from "projects" ${where} order by "projects"."name" asc, "projects"."id" asc limit $3`,
      `select count(*) from "projects" ${where}`,
    ]);
    expect(recorder.statements.at(0)?.params).toEqual(['%sam%', true, 10]);
  });
});
