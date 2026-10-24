import { describe, expect, it } from 'bun:test';
import type { JsonPlaceholderService } from '../../integrations/jsonplaceholder';
import { UserPostsService } from './user-posts.service';

describe('UserPostsService', () => {
  it('reads the posts from the outbound adapter', async () => {
    const asked: number[] = [];
    const adapter = {
      getUserPosts: (userId: number) => {
        asked.push(userId);
        return Promise.resolve([{ id: 1, userId, title: 'Sample Post', body: 'Body' }]);
      },
    } as unknown as JsonPlaceholderService;

    const posts = await new UserPostsService(adapter).listExternalPosts();

    expect(asked).toEqual([1]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe('Sample Post');
  });

  it("lets the adapter's typed error through", async () => {
    const failure = new Error('vendor down');
    const adapter = {
      getUserPosts: () => Promise.reject(failure),
    } as unknown as JsonPlaceholderService;

    expect(new UserPostsService(adapter).listExternalPosts()).rejects.toBe(failure);
  });
});
