import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { tasks, projects } from '../../../database/schema';

/**
 * Tasks of a project. When the domain needs it, override:
 * - `parentScope()` — ownership of the parent (e.g. its `createdBy` is the caller): another
 *   owner's project is then a 404 for every read and write;
 * - `assertParentWritable(parent)` — refuse writes by the parent's state (e.g. submitted).
 */
export class TasksRepository extends DependentRepository<typeof tasks, typeof projects> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(tasks, projects, tasks.projectId, txHost);
  }
}

export const tasksRepository = new TasksRepository();
