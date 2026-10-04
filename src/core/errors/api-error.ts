import { APP_ORIGIN, type AppErrorCode, type ErrorType } from './error-codes';

export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorOptions {
  details?: ErrorDetail[];
  /** `APP`, or the integration code for failures caused by an external system. */
  origin?: string;
  /** Overrides the class default with a more specific code from `APP_ERROR_CODES`. */
  code?: AppErrorCode;
}

export abstract class ApiError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorType: ErrorType;
  protected abstract readonly defaultCode: AppErrorCode;

  readonly details: ErrorDetail[];
  readonly origin: string;
  private readonly codeOverride?: AppErrorCode;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.details = options.details ?? [];
    this.origin = options.origin ?? APP_ORIGIN;
    this.codeOverride = options.code;
    Error.captureStackTrace(this, this.constructor);
  }

  get errorCode(): AppErrorCode {
    return this.codeOverride ?? this.defaultCode;
  }
}
