import { describe, expect, it, mock } from 'bun:test';
import type { HttpClientService } from '../../core/http';
import type { JsonPlaceholderPost } from './jsonplaceholder.dto';
import { JsonPlaceholderService } from './jsonplaceholder.service';

describe('JsonPlaceholderService (Unit Integration)', () => {
  const samplePost: JsonPlaceholderPost = {
    id: 1,
    userId: 1,
    title: 'Test Post Title',
    body: 'Test post body content',
  };

  it('getPostById should call client.get with /posts/:id', async () => {
    const mockGet = mock(async () => Promise.resolve(samplePost));
    const mockHttpClient = {
      get: mockGet,
    } as unknown as HttpClientService;

    const service = new JsonPlaceholderService(mockHttpClient);
    const result = await service.getPostById(1);

    expect(mockGet).toHaveBeenCalledWith('/posts/1');
    expect(result).toEqual(samplePost);
  });

  it('getUserPosts should call client.get with /posts and userId param', async () => {
    const mockGet = mock(async () => Promise.resolve([samplePost]));
    const mockHttpClient = {
      get: mockGet,
    } as unknown as HttpClientService;

    const service = new JsonPlaceholderService(mockHttpClient);
    const result = await service.getUserPosts(1);

    expect(mockGet).toHaveBeenCalledWith('/posts', { params: { userId: 1 } });
    expect(result).toEqual([samplePost]);
  });
});
