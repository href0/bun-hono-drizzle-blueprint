import { describe, expect, it } from 'bun:test';
import {
  APP_ERROR_CODES,
  BadRequestError,
  ConflictError,
  ERROR_CATALOG,
  ERROR_TYPES,
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
  type AppErrorCode,
  type ErrorType,
} from './index';

/** The class that sends each `error.type` (external failures are built per kind below). */
const CLASS_OF: Record<
  Exclude<ErrorType, 'EXTERNAL_SERVICE_ERROR'>,
  (code: AppErrorCode) => ApiError
> = {
  VALIDATION_ERROR: (code) => new ValidationError(undefined, { code }),
  BAD_REQUEST: (code) => new BadRequestError(undefined, { code }),
  UNAUTHORIZED: (code) => new UnauthorizedError(undefined, { code }),
  FORBIDDEN: (code) => new ForbiddenError(undefined, { code }),
  NOT_FOUND: (code) => new NotFoundError(undefined, { code }),
  CONFLICT: (code) => new ConflictError(undefined, { code }),
  PAYLOAD_TOO_LARGE: (code) => new PayloadTooLargeError(undefined, { code }),
  TOO_MANY_REQUESTS: (code) => new TooManyRequestsError(undefined, { code }),
  SERVICE_UNAVAILABLE: (code) => new ServiceUnavailableError(undefined, { code }),
  INTERNAL_SERVER_ERROR: (code) => new InternalServerError(undefined, { code }),
};

const integration = { code: 'VENDOR', institution: 'Vendor' };
const EXTERNAL: Partial<Record<AppErrorCode, ExternalServiceError>> = {
  [APP_ERROR_CODES.EXT_ERROR]: new ExternalServiceError('ERROR', 'vendor failed', { integration }),
  [APP_ERROR_CODES.EXT_UNREACHABLE]: new ExternalServiceError('UNREACHABLE', 'vendor failed', {
    integration,
  }),
  [APP_ERROR_CODES.EXT_TIMEOUT]: new ExternalServiceError('TIMEOUT', 'vendor failed', {
    integration,
  }),
};

describe('ERROR_CATALOG', () => {
  it('has an entry for every registry code', () => {
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual(Object.values(APP_ERROR_CODES).sort());
  });

  it('states the status and type each code is really sent with', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG) as [
      AppErrorCode,
      (typeof ERROR_CATALOG)[AppErrorCode],
    ][]) {
      const error =
        entry.type === ERROR_TYPES.EXTERNAL_SERVICE_ERROR
          ? EXTERNAL[code]
          : CLASS_OF[entry.type](code);
      expect({
        code,
        status: error?.statusCode,
        type: error?.errorType,
        sent: error?.errorCode,
      }).toEqual({
        code,
        status: entry.status,
        type: entry.type,
        sent: code,
      });
    }
  });

  it('explains every code in each supported language', () => {
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.meaning.id.length).toBeGreaterThan(0);
      expect(entry.meaning.en.length).toBeGreaterThan(0);
    }
  });
});
