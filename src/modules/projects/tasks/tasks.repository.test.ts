import { beforeEach, describe, expect, it } from 'bun:test';
import { NotFoundError } from '../../../core/errors';
import { TasksRepository } from './tasks.repository';
import { createSqlRecorder } from '../../../../test/helpers/sql-recorder';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';
const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

describe('TasksRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new TasksRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads a live row only while its project is live', async () => {
    expect(await repository.findById(ID)).toBeNull();
    expect(recorder.statements.at(0)?.sql).toContain(
      'where ("tasks"."deleted_at" is null and exists (select 1 from "projects" where ("projects"."id" = "tasks"."project_id" and "projects"."deleted_at" is null)) and "tasks"."id" = $1)',
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
});
