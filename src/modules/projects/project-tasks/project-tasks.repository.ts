import {
  DependentRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../../database';
import { projectTasks, projects, type ProjectTask } from '../../../database/schema';
import type { ProjectTaskListQueryDto, ProjectTaskSortField } from './project-tasks.dto';

/** The list's allowlist (D41): sortable fields → columns, and the columns `q` searches. */
const PROJECT_TASK_LIST_COLUMNS: ListColumns<ProjectTaskSortField> = {
  sort: {
    createdAt: projectTasks.createdAt,
    updatedAt: projectTasks.updatedAt,
    name: projectTasks.name,
  },
  search: [projectTasks.name],
};

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

  /** A page of the project's live rows matching the list query, and the total. */
  async findProjectTaskList(
    projectId: string,
    query: ProjectTaskListQueryDto,
  ): Promise<{ rows: ProjectTask[]; total: number }> {
    return this.findListForParent(
      projectId,
      query,
      PROJECT_TASK_LIST_COLUMNS,
      instantRange(projectTasks.createdAt, query.createdFrom, query.createdTo),
    );
  }
}

export const projectTasksRepository = new ProjectTasksRepository();
