import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES, type AppErrorCode } from './error-codes';

/** Failure class of an outbound call; the vendor's own HTTP status is never forwarded. */
export type ExternalFailureKind = 'TIMEOUT' | 'UNREACHABLE' | 'ERROR';

const FAILURES: Record<ExternalFailureKind, { statusCode: number; code: AppErrorCode }> = {
  TIMEOUT: { statusCode: 504, code: APP_ERROR_CODES.EXT_TIMEOUT },
  UNREACHABLE: { statusCode: 502, code: APP_ERROR_CODES.EXT_UNREACHABLE },
  ERROR: { statusCode: 502, code: APP_ERROR_CODES.EXT_ERROR },
};

export interface ExternalServiceErrorOptions extends Omit<ApiErrorOptions, 'code' | 'origin'> {
  /** Integration code identifying the external system (e.g. `JSONPLACEHOLDER`). */
  origin: string;
}

export class ExternalServiceError extends ApiError {
  readonly statusCode: number;
  readonly errorType = ERROR_TYPES.EXTERNAL_SERVICE_ERROR;
  protected readonly defaultCode: AppErrorCode;
  readonly kind: ExternalFailureKind;

  constructor(kind: ExternalFailureKind, message: string, options: ExternalServiceErrorOptions) {
    super(message, options);
    this.kind = kind;
    this.statusCode = FAILURES[kind].statusCode;
    this.defaultCode = FAILURES[kind].code;
  }
}
