import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { projects } from '../../database/schema';

export class ProjectsRepository extends BaseRepository<typeof projects> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(projects, txHost);
  }
}

export const projectsRepository = new ProjectsRepository();
