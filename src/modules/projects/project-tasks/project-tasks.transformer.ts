import type { ProjectTask } from '../../../database/schema';
import type { ProjectTaskResponse } from './project-tasks.dto';

export const toProjectTaskResponse = (entity: ProjectTask): ProjectTaskResponse => ({
  id: entity.id,
  projectId: entity.projectId,
  name: entity.name,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const toProjectTaskListResponse = (entities: ProjectTask[]): ProjectTaskResponse[] =>
  entities.map(toProjectTaskResponse);
