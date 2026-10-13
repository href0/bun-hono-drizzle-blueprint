import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { budgets, projects } from '../../../database/schema';

/**
 * The budget of a project (at most one live row). When the domain needs it,
 * override:
 * - `parentScope()` — ownership of the parent (e.g. its `createdBy` is the caller): another
 *   owner's project is then a 404 for every read and write;
 * - `assertParentWritable(parent)` — refuse writes by the parent's state (e.g. submitted).
 */
export class BudgetsRepository extends DependentRepository<typeof budgets, typeof projects> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(budgets, projects, budgets.projectId, txHost);
  }
}

export const budgetsRepository = new BudgetsRepository();
