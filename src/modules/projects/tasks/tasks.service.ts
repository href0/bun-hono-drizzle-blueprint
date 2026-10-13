import { tasksRepository, TasksRepository } from './tasks.repository';
import { NotFoundError } from '../../../core/errors';
import type { PaginationQueryDto } from '../../../core/dto/common.dto';
import type { CreateTaskDto, UpdateTaskDto } from './tasks.dto';
import { taskNotFoundMessage } from './tasks.messages';
import type { Task } from '../../../database/schema';

export class TasksService {
  constructor(private readonly repository: TasksRepository = tasksRepository) {}

  async createTask(projectId: string, dto: CreateTaskDto): Promise<Task> {
    return this.repository.createForParent(projectId, { ...dto });
  }

  async listTasks(
    projectId: string,
    query: PaginationQueryDto,
  ): Promise<{ records: Task[]; total: number }> {
    const [records, total] = await Promise.all([
      this.repository.findPageForParent(projectId, { page: query.page, perPage: query.perPage }),
      this.repository.countForParent(projectId),
    ]);
    return { records, total };
  }

  async getTaskById(id: string): Promise<Task> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(taskNotFoundMessage(id));
    return record;
  }

  async updateTask(id: string, dto: UpdateTaskDto): Promise<Task> {
    const updated = await this.repository.updateById(id, dto);
    if (!updated) throw new NotFoundError(taskNotFoundMessage(id));
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    const deleted = await this.repository.softDeleteById(id);
    if (!deleted) throw new NotFoundError(taskNotFoundMessage(id));
  }

  async restoreTask(id: string): Promise<Task> {
    const restored = await this.repository.restoreById(id);
    if (!restored) throw new NotFoundError(taskNotFoundMessage(id));
    return restored;
  }
}

export const tasksService = new TasksService();
