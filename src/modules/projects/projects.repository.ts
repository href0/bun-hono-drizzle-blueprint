import { and, eq } from 'drizzle-orm';
import {
  BaseRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { projects, type Project } from '../../database/schema';
import type { ProjectListQueryDto, ProjectSortField } from './projects.dto';

/** The list's allowlist (D41): sortable fields → columns, and the columns `q` searches. */
const PROJECT_LIST_COLUMNS: ListColumns<ProjectSortField> = {
  sort: {
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
    name: projects.name,
  },
  search: [projects.name],
};

export class ProjectsRepository extends BaseRepository<typeof projects> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(projects, txHost);
  }

  /** A page of live rows matching the list query, and the total under the same filters. */
  async findProjectList(query: ProjectListQueryDto): Promise<{ rows: Project[]; total: number }> {
    return this.findList(
      query,
      PROJECT_LIST_COLUMNS,
      and(
        query.isActive === undefined ? undefined : eq(projects.isActive, query.isActive),
        instantRange(projects.createdAt, query.createdFrom, query.createdTo),
      ),
    );
  }
}

export const projectsRepository = new ProjectsRepository();
