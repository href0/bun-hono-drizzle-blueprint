import { projectTasksRepository, ProjectTasksRepository } from './project-tasks.repository';
import { NotFoundError } from '../../../core/errors';
import type {
  CreateProjectTaskDto,
  ProjectTaskListQueryDto,
  UpdateProjectTaskDto,
} from './project-tasks.dto';
import { projectTaskNotFoundMessage } from './project-tasks.messages';
import type { ProjectTask } from '../../../database/schema';

export class ProjectTasksService {
  constructor(private readonly repository: ProjectTasksRepository = projectTasksRepository) {}

  async createProjectTask(projectId: string, dto: CreateProjectTaskDto): Promise<ProjectTask> {
    return this.repository.createForParent(projectId, { ...dto });
  }

  async listProjectTasks(
    projectId: string,
    query: ProjectTaskListQueryDto,
  ): Promise<{ records: ProjectTask[]; total: number }> {
    const { rows, total } = await this.repository.findProjectTaskList(projectId, query);
    return { records: rows, total };
  }

  async getProjectTaskById(id: string): Promise<ProjectTask> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(projectTaskNotFoundMessage(id));
    return record;
  }

  async updateProjectTask(id: string, dto: UpdateProjectTaskDto): Promise<ProjectTask> {
    const updated = await this.repository.updateById(id, dto);
    if (!updated) throw new NotFoundError(projectTaskNotFoundMessage(id));
    return updated;
  }

  async deleteProjectTask(id: string): Promise<void> {
    const deleted = await this.repository.softDeleteById(id);
    if (!deleted) throw new NotFoundError(projectTaskNotFoundMessage(id));
  }

  async restoreProjectTask(id: string): Promise<ProjectTask> {
    const restored = await this.repository.restoreById(id);
    if (!restored) throw new NotFoundError(projectTaskNotFoundMessage(id));
    return restored;
  }
}

export const projectTasksService = new ProjectTasksService();
