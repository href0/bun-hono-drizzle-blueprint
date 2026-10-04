import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  BadRequestError,
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  type ApiError,
} from '../errors';
import { globalErrorHandler } from './error-handler';
import { notFoundHandler } from './not-found';
import { REQUEST_ID_HEADER, requestContextMiddleware } from './request-context';

interface ErrorEnvelope {
  success: boolean;
  status_code: number;
  message: string;
  data?: unknown;
  error: {
    type: string;
    code: string;
    origin: string;
    details?: { field?: string; message: string }[];
  };
  request_id: string;
  timestamp: string;
}

const appThrowing = (error: unknown): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.get('/boom', () => {
    throw error;
  });
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);
  return app;
};

const call = async (
  error: unknown,
  path = '/boom',
): Promise<{ res: Response; body: ErrorEnvelope }> => {
  const res = await appThrowing(error).request(path, {
    headers: { [REQUEST_ID_HEADER]: 'req-err' },
  });
  return { res, body: (await res.json()) as ErrorEnvelope };
};

describe('globalErrorHandler — error envelope contract', () => {
  const cases: [string, ApiError][] = [
    ['VALIDATION_ERROR', new ValidationError('Invalid input')],
    ['BAD_REQUEST', new BadRequestError('Bad state')],
    ['UNAUTHORIZED', new UnauthorizedError('Login required')],
    ['FORBIDDEN', new ForbiddenError('Not allowed')],
    ['NOT_FOUND', new NotFoundError('User not found')],
    ['CONFLICT', new ConflictError('Duplicate email')],
    ['PAYLOAD_TOO_LARGE', new PayloadTooLargeError('Body too large')],
    ['TOO_MANY_REQUESTS', new TooManyRequestsError('Slow down')],
    ['SERVICE_UNAVAILABLE', new ServiceUnavailableError('Database down')],
    [
      'EXTERNAL_SERVICE_ERROR',
      new ExternalServiceError('TIMEOUT', 'Vendor timed out', { origin: 'PAYMENTS' }),
    ],
  ];

  it.each(cases)('%s → standard envelope without `data`', async (type, error) => {
    const { res, body } = await call(error);

    expect(res.status).toBe(error.statusCode);
    expect(body).toEqual({
      success: false,
      status_code: error.statusCode,
      message: error.message,
      error: { type, code: error.errorCode, origin: error.origin },
      request_id: 'req-err',
      timestamp: expect.any(String),
    });
    expect(body).not.toHaveProperty('data');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('should convert detail fields to snake_case', async () => {
    const { body } = await call(
      new ValidationError('Invalid input', {
        details: [
          { field: 'fullName', message: 'Required' },
          { field: 'address.postalCode', message: 'Invalid' },
          { message: 'Generic detail' },
        ],
      }),
    );

    expect(body.error.details).toEqual([
      { field: 'full_name', message: 'Required' },
      { field: 'address.postal_code', message: 'Invalid' },
      { message: 'Generic detail' },
    ]);
  });

  it('should set Retry-After for rate-limited responses', async () => {
    const { res } = await call(new TooManyRequestsError('Slow down', { retryAfterSeconds: 12.2 }));

    expect(res.headers.get('Retry-After')).toBe('13');
  });

  it('should hide the message and details of internal errors', async () => {
    const thrown = await call(
      new InternalServerError('INSERT returned no rows', {
        details: [{ message: 'secret detail' }],
      }),
    );
    const unknown = await call(new Error('database password is wrong'));

    for (const { res, body } of [thrown, unknown]) {
      expect(res.status).toBe(500);
      expect(body.message).toBe('Terjadi kesalahan pada server');
      expect(body.error).toEqual({
        type: 'INTERNAL_SERVER_ERROR',
        code: 'ERR_INTERNAL',
        origin: 'APP',
      });
    }
  });
});

describe('globalErrorHandler — Hono HTTPException', () => {
  const cases: [number, string, string][] = [
    [401, 'UNAUTHORIZED', 'ERR_UNAUTHORIZED'],
    [403, 'FORBIDDEN', 'ERR_FORBIDDEN'],
    [404, 'NOT_FOUND', 'ERR_NOT_FOUND'],
    [413, 'PAYLOAD_TOO_LARGE', 'ERR_PAYLOAD_TOO_LARGE'],
    [429, 'TOO_MANY_REQUESTS', 'ERR_RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE', 'ERR_SERVICE_UNAVAILABLE'],
    [422, 'BAD_REQUEST', 'ERR_BAD_REQUEST'],
    [502, 'INTERNAL_SERVER_ERROR', 'ERR_INTERNAL'],
  ];

  it.each(cases)('status %d keeps its meaning in the envelope', async (status, type, code) => {
    const { res, body } = await call(
      new HTTPException(status as 401, { message: 'Rejected by middleware' }),
    );
    const expectedStatus = status === 422 ? 400 : status === 502 ? 500 : status;

    expect(res.status).toBe(expectedStatus);
    expect(body.error).toMatchObject({ type, code });
  });

  it('should keep the middleware message, or fall back to the class default when empty', async () => {
    const withMessage = await call(new HTTPException(403, { message: 'Origin not allowed' }));
    const withoutMessage = await call(new HTTPException(403));

    expect(withMessage.body.message).toBe('Origin not allowed');
    expect(withoutMessage.body.message).toBe('Akses ditolak');
  });
});

describe('notFoundHandler', () => {
  it('should use the same envelope with ERR_ROUTE_NOT_FOUND', async () => {
    const { res, body } = await call(new Error('unused'), '/missing');

    expect(res.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      status_code: 404,
      message: 'Rute tidak ditemukan: GET /missing',
      error: { type: 'NOT_FOUND', code: 'ERR_ROUTE_NOT_FOUND', origin: 'APP' },
      request_id: 'req-err',
    });
    expect(body).not.toHaveProperty('data');
  });
});
