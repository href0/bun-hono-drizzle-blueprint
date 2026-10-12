import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { createApp } from '../src/app';
import { HttpClientService } from '../src/core/http';
import type { User } from '../src/database/schema';
import {
  JsonPlaceholderService,
  jsonPlaceholderService,
} from '../src/integrations/jsonplaceholder';
import { INTEGRATION_REGISTRY } from '../src/integrations/registry';
import { usersService } from '../src/modules/users/users.service';
import { authorize } from './helpers/authorized-app';

/**
 * Outbound contract (plan step 4.1), end to end: a real HTTP call from the users module through
 * the JSONPlaceholder adapter to a local fake vendor. Only the vendor's address is swapped (and
 * the user lookup, which would need the database).
 */

const user: User = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  email: 'test@example.com',
  fullName: 'Test User',
  passwordHash: '$argon2id$v=19$m=16,t=2,p=1$abc',
  role: 'user',
  passwordChangedAt: null,
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-01-01T00:00:00Z'),
};

const VENDOR_SECRET = 'vendor-internal-detail-7f3a';

describe('Outbound integration contract (E2E)', () => {
  let app: Hono;
  let vendor: ReturnType<typeof Bun.serve>;
  const vendorSawRequestIds: (string | null)[] = [];
  const spies: { mockRestore: () => void }[] = [];

  beforeAll(async () => {
    vendor = Bun.serve({
      port: 0,
      fetch: (req) => {
        vendorSawRequestIds.push(req.headers.get('X-Request-ID'));
        return Response.json(
          { error: 'invalid_client', hint: VENDOR_SECRET },
          { status: 401, headers: { 'X-Vendor-Trace': VENDOR_SECRET } },
        );
      },
    });
    const adapter = new JsonPlaceholderService(
      new HttpClientService({
        integration: INTEGRATION_REGISTRY.JSONPLACEHOLDER,
        baseURL: `http://localhost:${String(vendor.port)}`,
        timeoutMs: 2000,
      }),
    );
    spies.push(
      spyOn(usersService, 'getUserById').mockImplementation(async () => user),
      spyOn(jsonPlaceholderService, 'getUserPosts').mockImplementation((userId) =>
        adapter.getUserPosts(userId),
      ),
    );
    app = await authorize(createApp(), 'admin');
  });

  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    await vendor.stop(true);
  });

  it('should answer a vendor 401 with 502, naming the vendor but never echoing its answer', async () => {
    const res = await app.request(`/api/v1/users/${user.id}/external-posts`, {
      headers: { 'X-Request-ID': 'req-outbound-e2e', 'Accept-Language': 'en' },
    });
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      success: false,
      status_code: 502,
      message: 'External service request failed',
      error: {
        type: 'EXTERNAL_SERVICE_ERROR',
        code: 'ERR_EXT_ERROR',
        origin: 'JSONPLACEHOLDER',
        institution: 'JSONPlaceholder',
        details: [{ message: 'The external service rejected or failed to process the request' }],
      },
      request_id: 'req-outbound-e2e',
      timestamp: expect.any(String),
    });
    expect(text).not.toContain(VENDOR_SECRET);
    expect(text).not.toContain('invalid_client');
    expect(res.headers.get('X-Vendor-Trace')).toBeNull();
  });

  it('should send the inbound request ID to the vendor', async () => {
    vendorSawRequestIds.length = 0;

    await app.request(`/api/v1/users/${user.id}/external-posts`, {
      headers: { 'X-Request-ID': 'req-correlated-42' },
    });

    expect(vendorSawRequestIds).toEqual(['req-correlated-42']);
  });
});
