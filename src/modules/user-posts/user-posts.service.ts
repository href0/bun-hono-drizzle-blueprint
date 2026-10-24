import {
  JsonPlaceholderService,
  jsonPlaceholderService,
  type JsonPlaceholderPost,
} from '../../integrations/jsonplaceholder';

/**
 * Example of a domain service consuming an outbound vendor adapter (src/integrations/): the
 * adapter's typed errors (502 / 504, `error.origin`) reach the caller unchanged. Removed with the
 * examples by `bun run setup <name>`; the pattern itself is the scaffold `integration` template.
 */
export class UserPostsService {
  constructor(private readonly posts: JsonPlaceholderService = jsonPlaceholderService) {}

  /** The demo vendor has its own users (1–10): every user of this API reads the posts of its user 1. */
  async listExternalPosts(): Promise<JsonPlaceholderPost[]> {
    return this.posts.getUserPosts(1);
  }
}

export const userPostsService = new UserPostsService();
