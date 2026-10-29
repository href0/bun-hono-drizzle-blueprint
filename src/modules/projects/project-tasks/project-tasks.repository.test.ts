import { beforeEach, describe, expect, it } from 'bun:test';
import { NotFoundError } from '../../../core/errors';
import { ProjectTasksRepository } from './project-tasks.repository';
import { createSqlRecorder } from '../../../../test/helpers/sql-recorder';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

describe('ProjectTasksRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new ProjectTasksRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads a live row only while its project is live', async () => {
    expect(await repository.findById(ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain(
      'where ("project_tasks"."deleted_at" is null and exists (select 1 from "projects" where ("projects"."id" = "project_tasks"."project_id" and "projects"."deleted_at" is null)) and "project_tasks"."id" = $1)',
    );
  });

  it('creates under a live project only (locked first, rolled back otherwise)', async () => {
    let failure: unknown;
    try {
      await repository.createForParent(PARENT_ID, { name: 'Sample' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'BEGIN',
      expect.stringMatching(/^select .* from "projects" where .* for share$/) as string,
      'ROLLBACK',
    ]);
    expect(recorder.statements.at(1)?.params).toEqual([PARENT_ID]);
  });

  it("lists the project's rows by the allowlist: sort and q on the page and the total", async () => {
    recorder.respondWith([[PARENT_ID]], [[PARENT_ID]], [], [[0]]);

    expect(
      await repository.findProjectTaskList(PARENT_ID, {
        page: 1,
        perPage: 10,
        sort: [{ field: 'name', direction: 'asc' }],
        q: 'sam',
      }),
    ).toEqual({ rows: [], total: 0 });
    const rowQueries = recorder.statements
      .map((statement) => statement.sql)
      .filter((sql) => !sql.startsWith('select "id" from "projects"'));
    expect(rowQueries.at(0)).toContain(
      '"project_tasks"."project_id" = $1 and "project_tasks"."name" ilike $2) order by "project_tasks"."name" asc, "project_tasks"."id" asc limit $3',
    );
    expect(rowQueries.at(1)).toStartWith('select count(*) from "project_tasks"');
  });
});
