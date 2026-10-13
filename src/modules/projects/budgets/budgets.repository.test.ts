import { beforeEach, describe, expect, it } from 'bun:test';
import { NotFoundError } from '../../../core/errors';
import { BudgetsRepository } from './budgets.repository';
import { createSqlRecorder } from '../../../../test/helpers/sql-recorder';

const PARENT_ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9a';

describe('BudgetsRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new BudgetsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it("reads the project's live row only while the project is live", async () => {
    recorder.respondWith([[PARENT_ID]]);

    expect(await repository.findOneForParent(PARENT_ID)).toBeNull();
    expect(recorder.statements.at(1)?.sql).toContain(
      'exists (select 1 from "projects" where ("projects"."id" = "budgets"."project_id" and "projects"."deleted_at" is null))',
    );
  });

  it('saves under a live project only, locked FOR UPDATE (concurrent saves queue)', async () => {
    let failure: unknown;
    try {
      await repository.upsertForParent(PARENT_ID, { name: 'Sample' });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(NotFoundError);
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      'BEGIN',
      expect.stringMatching(/^select .* from "projects" where .* for update$/) as string,
      'ROLLBACK',
    ]);
  });
});
