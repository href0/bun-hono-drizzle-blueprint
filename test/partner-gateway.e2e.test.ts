import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { createApp } from '../src/app';
import { appConfig } from '../src/config';
import type { PartnerGatewayCredential } from '../src/core/middlewares/partner-auth';
import { hashPartnerApiKey, partnerSecretCipher } from '../src/core/security/partner-credentials';
import { partnerCredentialsService } from '../src/modules/partner-credentials/partner-credentials.service';
import { nowInstant } from '../src/utils/datetime.util';
import { signV1 } from '../src/utils/partner-signature.util';
import { authorize } from './helpers/authorized-app';

/**
 * The partner gateway through createApp(): partnerAuth() mounted on <base>/v1/partner, the
 * credential lookup wired to the partner-credentials module (spied: no database). Every refusal
 * branch is unit-tested in partner-auth.test.ts; this proves the wiring.
 */

const PARTNER = `${appConfig.API_BASE_PATH}/v1/partner`;
const API_KEY = 'pk_e2e_partner_key_000000000000000000000000000';
const SECRET = 'e2e-partner-secret';

const credential: PartnerGatewayCredential = {
  partnerCode: 'acme',
  encryptedSecret: partnerSecretCipher.encrypt(SECRET),
  ipWhitelist: [],
  allowedRoutes: ['/ping', '/echo'],
  rateLimitRpm: 1000,
  isActive: true,
};

let nonceCounter = 0;

const signedRequest = (
  method: string,
  path: string,
  body = '',
  headers: Record<string, string> = {},
): [string, RequestInit] => {
  const timestamp = String(nowInstant().epochMilliseconds);
  const nonce = `e2e_nonce_${String(++nonceCounter).padStart(10, '0')}`;
  const signature = signV1(SECRET, { timestamp, nonce, method, path, query: '', body });
  return [
    path,
    {
      method,
      body: body === '' ? undefined : body,
      headers: {
        'Content-Type': 'application/json',
        'x-partner-key': API_KEY,
        'x-partner-timestamp': timestamp,
        'x-partner-nonce': nonce,
        'x-partner-signature': signature,
        ...headers,
      },
    },
  ];
};

describe('Partner gateway — E2E through createApp()', () => {
  let lookup: ReturnType<typeof spyOn>;
  const app = createApp();

  beforeAll(() => {
    lookup = spyOn(partnerCredentialsService, 'findForGateway').mockImplementation(async (hash) =>
      hash === hashPartnerApiKey(API_KEY) ? credential : null,
    );
  });

  afterAll(() => {
    lookup.mockRestore();
  });

  it('GET /partner/ping with a valid signature → 200 as the partner', async () => {
    const res = await app.request(...signedRequest('GET', `${PARTNER}/ping`));
    const body = (await res.json()) as { data: { partner_code: string } };

    expect(res.status).toBe(200);
    expect(body.data.partner_code).toBe('acme');
    expect(lookup).toHaveBeenCalledWith(hashPartnerApiKey(API_KEY));
  });

  it('POST /partner/echo: the signed body is still read and validated by the handler', async () => {
    const res = await app.request(
      ...signedRequest('POST', `${PARTNER}/echo`, JSON.stringify({ message: 'halo partner' })),
    );
    const body = (await res.json()) as { data: { message: string } };

    expect(res.status).toBe(200);
    expect(body.data.message).toBe('halo partner');
  });

  it('a valid access token does not replace partner headers (401 ERR_PARTNER_HEADERS_MISSING)', async () => {
    const withToken = await authorize(createApp(), 'admin');
    const res = await withToken.request(`${PARTNER}/ping`);
    const body = (await res.json()) as { error: { code: string } };

    expect(`${String(res.status)} ${body.error.code}`).toBe('401 ERR_PARTNER_HEADERS_MISSING');
  });

  it('partner headers do not open bearer-protected routes', async () => {
    const [, init] = signedRequest('GET', `${appConfig.API_BASE_PATH}/v1/users`);
    const res = await app.request(`${appConfig.API_BASE_PATH}/v1/users`, init);
    const body = (await res.json()) as { error: { code: string } };

    expect(`${String(res.status)} ${body.error.code}`).toBe('401 ERR_UNAUTHORIZED');
  });

  it('a signature for another path is refused (401 ERR_PARTNER_SIGNATURE_INVALID)', async () => {
    const [, init] = signedRequest('GET', `${PARTNER}/echo`);
    const res = await app.request(`${PARTNER}/ping`, init);
    const body = (await res.json()) as { error: { code: string } };

    expect(`${String(res.status)} ${body.error.code}`).toBe('401 ERR_PARTNER_SIGNATURE_INVALID');
  });
});
