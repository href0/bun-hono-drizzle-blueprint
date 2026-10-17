import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { projectBudgets, projects } from '../../../database/schema';

/**
 * The projectBudget of a project (at most one live row). When the domain needs it,
 * override:
 * - `parentScope()` — ownership of the parent (e.g. its `createdBy` is the caller): another
 *   owner's project is then a 404 for every read and write;
 * - `assertParentWritable(parent)` — refuse writes by the parent's state (e.g. submitted).
 */
export class ProjectBudgetsRepository extends DependentRepository<
  typeof projectBudgets,
  typeof projects
> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(projectBudgets, projects, projectBudgets.projectId, txHost);
  }
}

export const projectBudgetsRepository = new ProjectBudgetsRepository();
