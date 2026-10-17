import { DependentRepository, defaultTxHost, type TransactionHost } from '../../../database';
import { projectTasks, projects } from '../../../database/schema';

/**
 * ProjectTasks of a project. When the domain needs it, override:
 * - `parentScope()` — ownership of the parent (e.g. its `createdBy` is the caller): another
 *   owner's project is then a 404 for every read and write;
 * - `assertParentWritable(parent)` — refuse writes by the parent's state (e.g. submitted).
 */
export class ProjectTasksRepository extends DependentRepository<
  typeof projectTasks,
  typeof projects
> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(projectTasks, projects, projectTasks.projectId, txHost);
  }
}

export const projectTasksRepository = new ProjectTasksRepository();
