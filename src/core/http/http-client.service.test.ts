import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { z } from 'zod';
import { HttpClientService, OUTBOUND_REQUEST_ID_HEADER } from './http-client.service';
import { VENDOR_BODY_LOG_LIMIT } from './vendor-body';
import { runWithRequestContext } from '../context/request-context';
import { ExternalServiceError } from '../errors/external.error';
import { I18N_MESSAGES } from '../i18n/messages';
import { logger } from '../logger/logger';

const VENDOR = { code: 'TEST_VENDOR', vendorName: 'Test Vendor Ltd.' };

type Server = ReturnType<typeof Bun.serve>;
const servers: Server[] = [];
const spies: { mockRestore: () => void }[] = [];

afterEach(async () => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

const serve = (fetch: (req: Request) => Response | Promise<Response>): string => {
  const server = Bun.serve({ port: 0, fetch });
  servers.push(server);
  return `http://localhost:${String(server.port)}`;
};

const clientFor = (baseURL: string, timeoutMs = 2000): HttpClientService =>
  new HttpClientService({ integration: VENDOR, baseURL, timeoutMs });

/** Captures `logger.error` calls as `[fields, message]`. */
const captureErrorLogs = (): unknown[][] => {
  const calls: unknown[][] = [];
  spies.push(
    spyOn(logger, 'error').mockImplementation((...args: unknown[]) => {
      calls.push(args);
    }),
  );
  return calls;
};

const captureError = async (call: () => Promise<unknown>): Promise<ExternalServiceError> => {
  try {
    await call();
  } catch (err: unknown) {
    expect(err).toBeInstanceOf(ExternalServiceError);
    return err as ExternalServiceError;
  }
  throw new Error('expected the call to fail');
};

const inRequest = <T>(requestId: string, fn: () => Promise<T>): Promise<T> =>
  runWithRequestContext({ requestId, locale: 'en', clientIp: '127.0.0.1', actor: 'anonymous' }, fn);

describe('HttpClientService (Unit)', () => {
  it('should classify a refused connection as UNREACHABLE (502)', async () => {
    captureErrorLogs();
    const client = clientFor('http://127.0.0.1:59999', 100); // Non-existent local port

    const error = await captureError(() => client.get('/test'));

    expect([error.kind, error.statusCode, error.errorCode]).toEqual([
      'UNREACHABLE',
      502,
      'ERR_EXT_UNREACHABLE',
    ]);
    expect([error.origin, error.vendorName]).toEqual(['TEST_VENDOR', 'Test Vendor Ltd.']);
    expect(error.details).toEqual([{ message: I18N_MESSAGES.EXTERNAL_UNREACHABLE_DETAIL }]);
  });

  it('should turn a vendor 401 into a 502 whose details never contain the vendor body', async () => {
    const logs = captureErrorLogs();
    const baseURL = serve(() =>
      Response.json({ error: 'invalid_client', accessToken: 'vendor-secret' }, { status: 401 }),
    );

    const error = await captureError(() => clientFor(baseURL).get('/secure?api_key=k-123'));

    expect([error.kind, error.statusCode, error.errorCode]).toEqual([
      'ERROR',
      502,
      'ERR_EXT_ERROR',
    ]);
    expect(error.details).toEqual([{ message: I18N_MESSAGES.EXTERNAL_ERROR_DETAIL }]);
    expect(JSON.stringify(error.details)).not.toContain('invalid_client');
    expect(error.vendorStatus).toBe(401); // for the adapter (re-login), never in the envelope

    // The vendor's answer is kept for operators — in the log, redacted, without the query string.
    expect(logs).toEqual([
      [
        {
          integration: 'TEST_VENDOR',
          kind: 'ERROR',
          method: 'get',
          url: '/secure',
          vendorStatus: 401,
          vendorBody: '{"error":"invalid_client","accessToken":"[REDACTED]"}',
          err: 'Request failed with status code 401',
        },
        'Outbound HTTP request failed',
      ],
    ]);
  });

  it('should log a long vendor body truncated, and never the request headers', async () => {
    const logs = captureErrorLogs();
    const baseURL = serve(() => new Response('x'.repeat(5000), { status: 500 }));

    await captureError(() =>
      clientFor(baseURL).post('/pay', {}, { headers: { Authorization: 'Bearer outbound-secret' } }),
    );

    const fields = logs.at(0)?.at(0) as { vendorBody: string };
    expect(fields.vendorBody).toStartWith('x'.repeat(VENDOR_BODY_LOG_LIMIT));
    expect(fields.vendorBody).toEndWith('…[truncated, 5000 chars]');
    expect(JSON.stringify(logs)).not.toContain('outbound-secret');
  });

  it('should classify an exceeded timeout as TIMEOUT (504)', async () => {
    captureErrorLogs();
    const baseURL = serve(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return new Response('late');
    });

    const error = await captureError(() => clientFor(baseURL, 50).get('/slow'));

    expect([error.kind, error.statusCode, error.errorCode]).toEqual([
      'TIMEOUT',
      504,
      'ERR_EXT_TIMEOUT',
    ]);
    expect(error.details).toEqual([{ message: I18N_MESSAGES.EXTERNAL_TIMEOUT_DETAIL }]);
  });

  it('should classify a failure that is not an HTTP error as ERROR (502)', async () => {
    const logs = captureErrorLogs();
    const baseURL = serve(() => Response.json({ ok: true }));

    const error = await captureError(() =>
      clientFor(baseURL).get('/data', {
        transformResponse: () => {
          throw new Error('cannot parse vendor payload');
        },
      }),
    );

    expect([error.kind, error.statusCode]).toEqual(['ERROR', 502]);
    expect(logs.at(0)?.at(0)).toMatchObject({ err: 'cannot parse vendor payload' });
  });

  it('should parse a vendor body into camelCase, and reject a mismatch as ERROR (502) logging only paths', async () => {
    const logs = captureErrorLogs();
    const client = clientFor('http://127.0.0.1:59999');
    const schema = z.object({ accessToken: z.string(), expiresIn: z.number() });

    expect(client.parse(schema, { access_token: 't-1', expires_in: 3600 })).toEqual({
      accessToken: 't-1',
      expiresIn: 3600,
    });

    let error: unknown;
    try {
      client.parse(schema, { access_token: 'vendor-secret-value', expires_in: 'soon' });
    } catch (err: unknown) {
      error = err;
    }
    expect(error).toBeInstanceOf(ExternalServiceError);
    const failure = error as ExternalServiceError;
    expect([failure.statusCode, failure.errorCode, failure.origin]).toEqual([
      502,
      'ERR_EXT_ERROR',
      'TEST_VENDOR',
    ]);
    expect(failure.details).toEqual([{ message: I18N_MESSAGES.EXTERNAL_ERROR_DETAIL }]);
    expect(logs).toEqual([
      [
        { integration: 'TEST_VENDOR', issues: [{ path: 'expiresIn', code: 'invalid_type' }] },
        'Outbound HTTP response rejected',
      ],
    ]);
    expect(JSON.stringify(logs)).not.toContain('vendor-secret-value');
  });

  it('should send the inbound request ID to the vendor', async () => {
    const seen: (string | null)[] = [];
    const baseURL = serve((req) => {
      seen.push(req.headers.get(OUTBOUND_REQUEST_ID_HEADER));
      return Response.json({ ok: true });
    });
    const client = clientFor(baseURL);

    await inRequest('req-outbound-1', () => client.get('/data'));
    await inRequest('req-outbound-2', () =>
      client.get('/data', { headers: { [OUTBOUND_REQUEST_ID_HEADER]: 'vendor-specific' } }),
    );
    await client.get('/data'); // outside a request (job, bootstrap): no header

    expect(seen).toEqual(['req-outbound-1', 'vendor-specific', null]);
  });

  it('should successfully execute get, post, put, delete with keep-alive server', async () => {
    const baseURL = serve((req) => {
      const url = new URL(req.url);
      if (url.pathname === '/data') {
        return Response.json({ method: req.method, ok: true });
      }
      return new Response('Not Found', { status: 404 });
    });
    const client = clientFor(baseURL);

    const getRes = await client.get<{ method: string; ok: boolean }>('/data');
    expect(getRes).toEqual({ method: 'GET', ok: true });

    const postRes = await client.post<{ method: string; ok: boolean }>('/data', { payload: 1 });
    expect(postRes).toEqual({ method: 'POST', ok: true });

    const putRes = await client.put<{ method: string; ok: boolean }>('/data', { payload: 2 });
    expect(putRes).toEqual({ method: 'PUT', ok: true });

    const deleteRes = await client.delete<{ method: string; ok: boolean }>('/data');
    expect(deleteRes).toEqual({ method: 'DELETE', ok: true });
  });
});
