import { describe, expect, it } from 'bun:test';
import {
  APP_ERROR_CODES,
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
} from './index';

describe('ApiError hierarchy (Unit)', () => {
  const cases: [ApiError, number, string, string][] = [
    [new ValidationError(), 400, 'VALIDATION_ERROR', 'ERR_INVALID_INPUT'],
    [new BadRequestError(), 400, 'BAD_REQUEST', 'ERR_BAD_REQUEST'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED', 'ERR_UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN', 'ERR_FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND', 'ERR_NOT_FOUND'],
    [new ConflictError(), 409, 'CONFLICT', 'ERR_CONFLICT'],
    [new PayloadTooLargeError(), 413, 'PAYLOAD_TOO_LARGE', 'ERR_PAYLOAD_TOO_LARGE'],
    [new TooManyRequestsError(), 429, 'TOO_MANY_REQUESTS', 'ERR_RATE_LIMITED'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE', 'ERR_SERVICE_UNAVAILABLE'],
    [new InternalServerError(), 500, 'INTERNAL_SERVER_ERROR', 'ERR_INTERNAL'],
  ];

  it.each(cases)('%p maps to status, type and default code', (error, status, type, code) => {
    expect(error.statusCode).toBe(status);
    expect(error.errorType).toBe(type as ApiError['errorType']);
    expect(error.errorCode).toBe(code as ApiError['errorCode']);
    expect(error.origin).toBe('APP');
    expect(error.details).toEqual([]);
    expect(error.name).toBe(error.constructor.name);
  });

  it('should accept details, origin and a more specific code', () => {
    const error = new ValidationError('Invalid request body', {
      code: APP_ERROR_CODES.INVALID_JSON,
      details: [{ field: 'body', message: 'Malformed JSON' }],
      origin: 'APP',
    });

    expect(error.message).toBe('Invalid request body');
    expect(error.errorCode).toBe('ERR_INVALID_JSON');
    expect(error.details).toEqual([{ field: 'body', message: 'Malformed JSON' }]);
  });

  it('TooManyRequestsError should carry retryAfterSeconds', () => {
    expect(new TooManyRequestsError('Slow down', { retryAfterSeconds: 30 }).retryAfterSeconds).toBe(
      30,
    );
  });

  it('ExternalServiceError should derive status and code from the failure kind, never the vendor', () => {
    const integration = { code: 'PAYMENTS', institution: 'Payments Inc.' };
    const timeout = new ExternalServiceError('TIMEOUT', 'Vendor timed out', { integration });
    const unreachable = new ExternalServiceError('UNREACHABLE', 'Vendor down', { integration });
    const failed = new ExternalServiceError('ERROR', 'Vendor error', { integration });

    expect([timeout.statusCode, timeout.errorCode]).toEqual([504, 'ERR_EXT_TIMEOUT']);
    expect([unreachable.statusCode, unreachable.errorCode]).toEqual([502, 'ERR_EXT_UNREACHABLE']);
    expect([failed.statusCode, failed.errorCode, failed.kind]).toEqual([
      502,
      'ERR_EXT_ERROR',
      'ERROR',
    ]);
    expect(failed.errorType).toBe('EXTERNAL_SERVICE_ERROR');
    expect([failed.origin, failed.institution]).toEqual(['PAYMENTS', 'Payments Inc.']);
  });
});
