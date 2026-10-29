import { projectsRepository, ProjectsRepository } from './projects.repository';
import { NotFoundError } from '../../core/errors';
import type { CreateProjectDto, ProjectListQueryDto, UpdateProjectDto } from './projects.dto';
import { projectNotFoundMessage } from './projects.messages';
import type { Project } from '../../database/schema';

export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository = projectsRepository) {}

  async createProject(dto: CreateProjectDto): Promise<Project> {
    return this.repository.create({ ...dto });
  }

  async getProjectById(id: string): Promise<Project> {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError(projectNotFoundMessage(id));
    return record;
  }

  async listProjects(query: ProjectListQueryDto): Promise<{ records: Project[]; total: number }> {
    const { rows, total } = await this.repository.findProjectList(query);
    return { records: rows, total };
  }

  async updateProject(id: string, dto: UpdateProjectDto): Promise<Project> {
    const updated = await this.repository.updateById(id, dto);
    if (!updated) throw new NotFoundError(projectNotFoundMessage(id));
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    const deleted = await this.repository.softDeleteById(id);
    if (!deleted) throw new NotFoundError(projectNotFoundMessage(id));
  }

  async restoreProject(id: string): Promise<Project> {
    const restored = await this.repository.restoreById(id);
    if (!restored) throw new NotFoundError(projectNotFoundMessage(id));
    return restored;
  }
}

export const projectsService = new ProjectsService();
