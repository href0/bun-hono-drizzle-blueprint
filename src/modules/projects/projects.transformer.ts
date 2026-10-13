import type { Project } from '../../database/schema';
import type { ProjectResponse } from './projects.dto';

export const toProjectResponse = (entity: Project): ProjectResponse => ({
  id: entity.id,
  name: entity.name,
  isActive: entity.isActive,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const toProjectListResponse = (entities: Project[]): ProjectResponse[] =>
  entities.map(toProjectResponse);
