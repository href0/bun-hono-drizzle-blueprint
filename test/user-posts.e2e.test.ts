/**
 * Example outbound module (removed by `bun run setup <name>` unless --keep-examples): the posts of
 * a user from the JSONPlaceholder adapter, through createApp() — own id or admin, others 403.
 * The vendor call itself is spied here; test/outbound.e2e.test.ts sends it to a fake vendor.
 */
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import { createApp } from '../src/app';
import { userPostsService } from '../src/modules/user-posts/user-posts.service';
import { authorize } from './helpers/authorized-app';

const ownId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const otherId = 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a99';

describe('User posts (example outbound module) — E2E', () => {
  let listSpy: ReturnType<typeof spyOn>;
  let admin: Hono;
  let owner: Hono;

  beforeAll(async () => {
    listSpy = spyOn(userPostsService, 'listExternalPosts').mockImplementation(async () => [
      { id: 1, userId: 1, title: 'Sample Post', body: 'Sample Body' },
    ]);
    admin = await authorize(createApp(), 'admin');
    owner = await authorize(createApp(), 'user', ownId);
  });

  afterAll(() => {
    listSpy.mockRestore();
  });

  const get = (app: Hono, id: string): Promise<Response> =>
    Promise.resolve(app.request(`/api/v1/users/${id}/external-posts`));

  it('GET /users/:id/external-posts returns the posts in the envelope', async () => {
    const res = await get(owner, ownId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      data: Array<{ title: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.status_code).toBe(200);
    expect(body.data[0]?.title).toBe('Sample Post');
  });

  it('a user reads their own posts only; an admin reads anyone’s', async () => {
    const forbidden = await get(owner, otherId);
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe(
      'ERR_ROLE_FORBIDDEN',
    );
    expect((await get(admin, otherId)).status).toBe(200);
  });

  it('rejects an id that is not a UUID (400)', async () => {
    expect((await get(admin, 'not-a-uuid')).status).toBe(400);
  });
});
