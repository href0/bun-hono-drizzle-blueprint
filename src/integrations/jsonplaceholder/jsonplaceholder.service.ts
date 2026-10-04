import { env } from '../../config/env.config';
import { HttpClientService } from '../../core/http';
import type { JsonPlaceholderPost } from './jsonplaceholder.dto';

export const defaultJsonPlaceholderHttpClient = new HttpClientService({
  baseURL: env.JSONPLACEHOLDER_BASE_URL,
  timeoutMs: env.JSONPLACEHOLDER_TIMEOUT_MS,
  originName: 'JSONPLACEHOLDER',
});

/**
 * Outbound integration adapter for JSONPlaceholder public REST API.
 * Injected into domain services (e.g. UsersService) to fetch external posts/activities.
 */
export class JsonPlaceholderService {
  constructor(private readonly httpClient: HttpClientService = defaultJsonPlaceholderHttpClient) {}

  /**
   * Fetches a post by its ID from the external provider.
   */
  async getPostById(id: number): Promise<JsonPlaceholderPost> {
    return this.httpClient.get<JsonPlaceholderPost>(`/posts/${id.toString()}`);
  }

  /**
   * Fetches all posts belonging to an external userId.
   */
  async getUserPosts(userId: number): Promise<JsonPlaceholderPost[]> {
    return this.httpClient.get<JsonPlaceholderPost[]>('/posts', {
      params: { userId },
    });
  }
}

export const jsonPlaceholderService = new JsonPlaceholderService();
