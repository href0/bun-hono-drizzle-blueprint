import type { Task } from '../../../database/schema';
import type { TaskResponse } from './tasks.dto';

export const toTaskResponse = (entity: Task): TaskResponse => ({
  id: entity.id,
  projectId: entity.projectId,
  name: entity.name,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const toTaskListResponse = (entities: Task[]): TaskResponse[] =>
  entities.map(toTaskResponse);
