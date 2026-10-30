import { beforeAll, describe, expect, it } from 'bun:test';
import type { Hono } from 'hono';
import { createApp } from '../../src/app';
import { partnerCredentialsService } from '../../src/modules/partner-credentials/partner-credentials.service';
import { partnerSignatureHeaders } from '../../src/utils/partner-signature.util';
import { asActor } from '../helpers/integration';

/**
 * The partner gateway through createApp() on a real PostgreSQL and Redis: the
 * credential lookup and its cache, nonce replay protection and the per-partner rate limit — the
 * parts the e2e suite fakes.
 */

let app: Hono;

beforeAll(() => {
  app = createApp();
});

interface Issued {
  id: string;
  apiKey: string;
  secret: string;
}

const issueCredential = async (rateLimitRpm = 60): Promise<Issued> => {
  const issued = await asActor(() =>
    partnerCredentialsService.createCredential({
      partnerCode: `int-${Bun.randomUUIDv7().slice(-12)}`,
      partnerName: 'Integration Partner',
      ipWhitelist: [],
      allowedRoutes: ['/*'],
      rateLimitRpm,
    }),
  );
  return { id: issued.credential.id, apiKey: issued.apiKey, secret: issued.secret };
};

const newNonce = (): string => crypto.randomUUID().replaceAll('-', '');

const ping = async (partner: Pick<Issued, 'apiKey' | 'secret'>, nonce = newNonce()) => {
  const url = '/api/v1/partner/ping';
  const res = await app.request(url, {
    headers: partnerSignatureHeaders({
      apiKey: partner.apiKey,
      secret: partner.secret,
      method: 'GET',
      url,
      timestamp: String(Date.now()),
      nonce,
    }),
  });
  const body = (await res.json()) as { error?: { code: string } };
  return { status: res.status, code: body.error?.code };
};

describe('partner gateway on PostgreSQL + Redis', () => {
  it('accepts a signed request and refuses the same nonce a second time (replay)', async () => {
    const partner = await issueCredential();
    const nonce = newNonce();

    expect(await ping(partner, nonce)).toEqual({ status: 200, code: undefined });
    expect(await ping(partner, nonce)).toEqual({
      status: 401,
      code: 'ERR_PARTNER_REPLAY_REJECTED',
    });
  });

  it('applies the partner’s own rate_limit_rpm', async () => {
    const partner = await issueCredential(2);

    const statuses = [];
    for (let request = 0; request < 3; request += 1) statuses.push((await ping(partner)).status);

    expect(statuses).toEqual([200, 200, 429]);
  });

  it('refuses a deactivated partner and a rotated-away key at once (the cached lookup is dropped)', async () => {
    const partner = await issueCredential();
    expect((await ping(partner)).status).toBe(200);

    await asActor(() => partnerCredentialsService.setActive(partner.id, false));
    expect(await ping(partner)).toEqual({ status: 401, code: 'ERR_PARTNER_INVALID_KEY' });

    await asActor(() => partnerCredentialsService.setActive(partner.id, true));
    const { apiKey } = await asActor(() => partnerCredentialsService.rotateApiKey(partner.id));
    expect(await ping(partner)).toEqual({ status: 401, code: 'ERR_PARTNER_INVALID_KEY' });
    expect((await ping({ apiKey, secret: partner.secret })).status).toBe(200);
  });
});
