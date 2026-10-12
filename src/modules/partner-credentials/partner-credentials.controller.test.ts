import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import type { PartnerCredential } from '../../database/schema';
import { PartnerCredentialsController } from './partner-credentials.controller';
import type { PartnerCredentialsService } from './partner-credentials.service';

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';

const credential: PartnerCredential = {
  id: ID,
  partnerCode: 'acme',
  partnerName: 'Acme Corp',
  apiKeyHash: 'a'.repeat(64),
  apiKeyPrefix: 'pk_abcdefgh',
  encryptedSecret: 'v1.test.iv.tag.ciphertext',
  ipWhitelist: [],
  allowedRoutes: ['/*'],
  rateLimitRpm: 60,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'system',
  updatedBy: 'system',
  deletedAt: null,
};

const calls: unknown[][] = [];
const service: Partial<PartnerCredentialsService> = {
  createCredential: async (dto) => {
    calls.push(['create', dto]);
    return { credential, apiKey: 'pk_new', secret: 'new-secret' };
  },
  listCredentials: async (query) => {
    calls.push(['list', query]);
    return { credentials: [credential], total: 21 };
  },
  getCredentialById: async (id) => {
    calls.push(['get', id]);
    return credential;
  },
  updateCredential: async (id, dto) => {
    calls.push(['update', id, dto]);
    return { ...credential, ...dto };
  },
  setActive: async (id, isActive) => {
    calls.push(['setActive', id, isActive]);
    return { ...credential, isActive };
  },
  rotateSecret: async (id) => {
    calls.push(['rotateSecret', id]);
    return { credential, secret: 'rotated-secret' };
  },
  rotateApiKey: async (id) => {
    calls.push(['rotateApiKey', id]);
    return { credential, apiKey: 'pk_rotated' };
  },
  deleteCredential: async (id) => {
    calls.push(['delete', id]);
  },
  restoreCredential: async (id) => {
    calls.push(['restore', id]);
    return credential;
  },
};

const controller = new PartnerCredentialsController(service as PartnerCredentialsService);
const next = (async () => undefined) as never;

interface Sent {
  status: number;
  body: { data: Record<string, unknown> | Record<string, unknown>[] | null; meta?: unknown };
}

/** Runs a handler with validated input as validate() would leave it; returns the JSON sent. */
const run = async (
  handler: (c: never, n: never) => unknown,
  validated: { body?: unknown; params?: unknown; query?: unknown },
): Promise<Sent> => {
  const context = {
    get: (key: string) =>
      ({
        validatedBody: validated.body,
        validatedParams: validated.params,
        validatedQuery: validated.query,
      })[key],
    json: (body: unknown, status: number) => ({ body, status }),
  };
  return (await handler(context as never, next)) as Sent;
};

describe('PartnerCredentialsController (Unit)', () => {
  const params = { id: ID };

  it('create → 201 with the one-time API key and secret (snake_case)', async () => {
    const body = { partnerCode: 'acme', partnerName: 'Acme', allowedRoutes: ['/*'] };
    const sent = await run(controller.create, { body });

    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({
      partner_code: 'acme',
      api_key: 'pk_new',
      secret: 'new-secret',
    });
    expect(sent.body.data).not.toHaveProperty('api_key_hash');
    expect(sent.body.data).not.toHaveProperty('encrypted_secret');
    expect(calls).toContainEqual(['create', body]);
  });

  it('list → 200 with page meta and no key material', async () => {
    const sent = await run(controller.list, { query: { page: 2, perPage: 10 } });

    expect(sent.status).toBe(200);
    expect(sent.body.meta).toEqual({
      current_page: 2,
      per_page: 10,
      total_items: 21,
      total_pages: 3,
    });
    expect(JSON.stringify(sent.body)).not.toContain(credential.apiKeyHash);
    expect(JSON.stringify(sent.body)).not.toContain(credential.encryptedSecret);
  });

  it('getById, update, activate, deactivate, restore → 200 without key material', async () => {
    const cases: [(c: never, n: never) => unknown, unknown[], Record<string, unknown>][] = [
      [controller.getById, ['get', ID], {}],
      [controller.update, ['update', ID, { rateLimitRpm: 5 }], { rate_limit_rpm: 5 }],
      [controller.activate, ['setActive', ID, true], { is_active: true }],
      [controller.deactivate, ['setActive', ID, false], { is_active: false }],
      [controller.restore, ['restore', ID], {}],
    ];
    for (const [handler, call, expected] of cases) {
      const sent = await run(handler, { params, body: { rateLimitRpm: 5 } });

      expect(sent.status).toBe(200);
      expect(sent.body.data).toMatchObject({ id: ID, ...expected });
      expect(sent.body.data).not.toHaveProperty('api_key');
      expect(sent.body.data).not.toHaveProperty('secret');
      expect(JSON.stringify(sent.body)).not.toContain(credential.encryptedSecret);
      expect(calls).toContainEqual(call);
    }
  });

  it('rotations → 201 with only the rotated value', async () => {
    const secret = await run(controller.rotateSecret, { params });
    expect(secret.status).toBe(201);
    expect(secret.body.data).toMatchObject({ secret: 'rotated-secret' });
    expect(secret.body.data).not.toHaveProperty('api_key');

    const apiKey = await run(controller.rotateApiKey, { params });
    expect(apiKey.status).toBe(201);
    expect(apiKey.body.data).toMatchObject({ api_key: 'pk_rotated' });
    expect(apiKey.body.data).not.toHaveProperty('secret');
  });

  it('remove → 200 with null data', async () => {
    const sent = await run(controller.remove, { params });

    expect(sent.status).toBe(200);
    expect(sent.body.data).toBeNull();
    expect(calls).toContainEqual(['delete', ID]);
  });
});
