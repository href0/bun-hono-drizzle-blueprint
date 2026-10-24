import { describe, expect, it } from 'bun:test';
import { UserPostsController } from './user-posts.controller';
import type { UserPostsService } from './user-posts.service';

describe('UserPostsController', () => {
  const service: Partial<UserPostsService> = {
    listExternalPosts: async () => [{ id: 1, userId: 1, title: 'Sample Post', body: 'Body' }],
  };
  const controller = new UserPostsController(service as UserPostsService);
  const next = (async () => {}) as any;

  it('list returns the posts with 200', async () => {
    const context = { json: (data: unknown, status: number) => ({ data, status }) } as any;

    const result = (await controller.list(context, next)) as unknown as {
      status: number;
      data: { success: boolean; data: Array<{ title: string }> };
    };

    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    expect(result.data.data[0]?.title).toBe('Sample Post');
  });
});
