import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import type { Hono } from 'hono';
import { Temporal } from 'temporal-polyfill';
import { createApp } from '../src/app';
import { ConflictError } from '../src/core/errors';
import type { PartnerCredential } from '../src/database/schema';
import { PARTNER_CREDENTIAL_MESSAGES } from '../src/modules/partner-credentials/partner-credentials.messages';
import { partnerCredentialsService } from '../src/modules/partner-credentials/partner-credentials.service';
import { authorize } from './helpers/authorized-app';

/**
 * Partner credentials admin API — contract tests. The service singleton is spied (no database);
 * the service itself is covered by partner-credentials.service.test.ts.
 */

const ID = '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e';

const credential: PartnerCredential = {
  id: ID,
  partnerCode: 'acme',
  partnerName: 'Acme Corp',
  apiKeyHash: 'a'.repeat(64),
  apiKeyPrefix: 'pk_abcdefgh',
  encryptedSecret: 'v1.test.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB.Q0lQSEVSVEVYVA',
  ipWhitelist: ['203.0.113.0/24'],
  allowedRoutes: ['/orders/*'],
  rateLimitRpm: 60,
  isActive: true,
  createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
  createdBy: 'user:admin',
  updatedBy: 'user:admin',
  deletedAt: null,
};

const KEY_MATERIAL = [credential.apiKeyHash, credential.encryptedSecret];

const VALID_CREATE = { partner_code: 'acme', partner_name: 'Acme', allowed_routes: ['/*'] };

const ROUTES: readonly (readonly [string, string, unknown?])[] = [
  ['POST', '', VALID_CREATE],
  ['GET', ''],
  ['GET', `/${ID}`],
  ['PATCH', `/${ID}`, { rate_limit_rpm: 10 }],
  ['POST', `/${ID}/activate`],
  ['POST', `/${ID}/deactivate`],
  ['POST', `/${ID}/secret-rotations`],
  ['POST', `/${ID}/api-key-rotations`],
  ['DELETE', `/${ID}`],
  ['POST', `/${ID}/restore`],
];

describe('Partner credentials — E2E contract', () => {
  const spies: { mockRestore: () => void }[] = [];
  const createdWith: unknown[] = [];
  let admin: Hono;
  let user: Hono;

  beforeAll(async () => {
    const service = partnerCredentialsService;
    spies.push(
      spyOn(service, 'createCredential').mockImplementation(async (dto) => {
        createdWith.push(dto);
        if (dto.partnerCode === 'taken') {
          throw new ConflictError(PARTNER_CREDENTIAL_MESSAGES.CODE_TAKEN);
        }
        return { credential, apiKey: 'pk_issued', secret: 'issued-secret' };
      }),
      spyOn(service, 'listCredentials').mockImplementation(async () => ({
        credentials: [credential],
        total: 1,
      })),
      spyOn(service, 'getCredentialById').mockImplementation(async () => credential),
      spyOn(service, 'updateCredential').mockImplementation(async () => credential),
      spyOn(service, 'setActive').mockImplementation(async () => credential),
      spyOn(service, 'rotateSecret').mockImplementation(async () => ({
        credential,
        secret: 'rotated-secret',
      })),
      spyOn(service, 'rotateApiKey').mockImplementation(async () => ({
        credential,
        apiKey: 'pk_rotated',
      })),
      spyOn(service, 'deleteCredential').mockImplementation(async () => undefined),
      spyOn(service, 'restoreCredential').mockImplementation(async () => credential),
    );
    admin = await authorize(createApp(), 'admin');
    user = await authorize(createApp(), 'user');
  });

  afterAll(() => {
    for (const spy of spies) spy.mockRestore();
  });

  const send = (app: Hono, method: string, path: string, body?: unknown): Promise<Response> =>
    Promise.resolve(
      app.request(`/api/v1/partner-credentials${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  const codeOf = async (res: Response): Promise<string> =>
    `${String(res.status)} ${((await res.json()) as { error?: { code: string } }).error?.code ?? 'ok'}`;

  it('refuses every route to a non-admin (403 ERR_ROLE_FORBIDDEN)', async () => {
    for (const [method, path, body] of ROUTES) {
      expect(`${method} ${path}: ${await codeOf(await send(user, method, path, body))}`).toBe(
        `${method} ${path}: 403 ERR_ROLE_FORBIDDEN`,
      );
    }
  });

  it('serves every route to an admin, never with the key hash or the encrypted secret', async () => {
    for (const [method, path, body] of ROUTES) {
      const res = await send(admin, method, path, body);
      const text = await res.text();

      expect(`${method} ${path}: ${String(res.status)}`).toMatch(/: 20[01]$/);
      for (const material of KEY_MATERIAL) expect(text).not.toContain(material);
      expect(text).not.toContain('api_key_hash');
      expect(text).not.toContain('encrypted_secret');
    }
  });

  it('shows the API key and secret only in the create and rotation responses', async () => {
    const dataOf = async (res: Response) =>
      ((await res.json()) as { data: Record<string, unknown> | Record<string, unknown>[] }).data;

    expect(await dataOf(await send(admin, 'POST', '', VALID_CREATE))).toMatchObject({
      api_key: 'pk_issued',
      secret: 'issued-secret',
      api_key_prefix: 'pk_abcdefgh',
    });
    expect(await dataOf(await send(admin, 'POST', `/${ID}/secret-rotations`))).toMatchObject({
      secret: 'rotated-secret',
    });
    expect(await dataOf(await send(admin, 'POST', `/${ID}/api-key-rotations`))).toMatchObject({
      api_key: 'pk_rotated',
    });

    const list = await dataOf(await send(admin, 'GET', ''));
    const detail = await dataOf(await send(admin, 'GET', `/${ID}`));
    for (const item of [...(Array.isArray(list) ? list : [list]), detail]) {
      expect(item).not.toHaveProperty('api_key');
      expect(item).not.toHaveProperty('secret');
    }
  });

  it('normalizes the create body: trimmed lowercase IP rules, duplicates dropped, defaults', async () => {
    createdWith.length = 0;
    const res = await send(admin, 'POST', '', {
      partner_code: 'acme-2',
      partner_name: '  Acme Two  ',
      ip_whitelist: [' 2001:DB8::/32 ', '2001:db8::/32', '203.0.113.7'],
      allowed_routes: ['/orders/*', '/orders/*', '/ping'],
    });

    expect(res.status).toBe(201);
    expect(createdWith).toEqual([
      {
        partnerCode: 'acme-2',
        partnerName: 'Acme Two',
        ipWhitelist: ['2001:db8::/32', '203.0.113.7'],
        allowedRoutes: ['/orders/*', '/ping'],
        rateLimitRpm: 60,
      },
    ]);
  });

  it('rejects invalid codes, IP rules and route patterns (400 ERR_INVALID_INPUT, field named)', async () => {
    const valid = VALID_CREATE;
    const invalid: [Record<string, unknown>, string][] = [
      [{ ...valid, partner_code: 'Acme' }, 'partner_code'],
      [{ ...valid, partner_code: 'ac' }, 'partner_code'],
      [{ ...valid, partner_code: '-acme' }, 'partner_code'],
      [{ ...valid, ip_whitelist: ['10.0.0.5/24'] }, 'ip_whitelist.0'],
      [{ ...valid, ip_whitelist: ['localhost'] }, 'ip_whitelist.0'],
      [{ ...valid, allowed_routes: [] }, 'allowed_routes'],
      [{ ...valid, allowed_routes: ['orders'] }, 'allowed_routes.0'],
      [{ ...valid, allowed_routes: ['/orders/../admin'] }, 'allowed_routes.0'],
      [{ ...valid, allowed_routes: ['/orders//x'] }, 'allowed_routes.0'],
      [{ ...valid, allowed_routes: ['/*/orders'] }, 'allowed_routes.0'],
      [{ ...valid, allowed_routes: ['/orders?x=1'] }, 'allowed_routes.0'],
      [{ ...valid, rate_limit_rpm: 0 }, 'rate_limit_rpm'],
    ];

    for (const [body, field] of invalid) {
      const res = await send(admin, 'POST', '', body);
      const json = (await res.json()) as {
        error: { code: string; details: { field: string }[] };
      };
      expect(`${String(res.status)} ${json.error.code}`).toBe('400 ERR_INVALID_INPUT');
      expect(json.error.details.map((detail) => detail.field)).toContain(field);
    }
  });

  it('keeps the code permanent: PATCH ignores it, an empty PATCH is 400', async () => {
    expect((await send(admin, 'PATCH', `/${ID}`, {})).status).toBe(400);
    expect((await send(admin, 'PATCH', `/${ID}`, { partner_code: 'other' })).status).toBe(400);
  });

  it('answers a reused partner code with 409', async () => {
    const res = await send(admin, 'POST', '', { ...VALID_CREATE, partner_code: 'taken' });

    expect(await codeOf(res)).toBe('409 ERR_CONFLICT');
  });
});
