import { asyncHandler } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { USER_POST_MESSAGES } from './user-posts.messages';
import { userPostsService, UserPostsService } from './user-posts.service';

export class UserPostsController {
  constructor(private readonly service: UserPostsService = userPostsService) {}

  list = asyncHandler(async () => {
    const posts = await this.service.listExternalPosts();
    return new ApiResponse(posts, USER_POST_MESSAGES.EXTERNAL_POSTS_RETRIEVED, 200);
  });
}

export const userPostsController = new UserPostsController();
