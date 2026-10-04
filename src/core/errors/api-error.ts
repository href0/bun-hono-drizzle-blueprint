import { translate, type MessageInput } from '../i18n/translate';
import { APP_ORIGIN, type AppErrorCode, type ErrorType } from './error-codes';

export interface ErrorDetail {
  field?: string;
  /** Localizable; validation messages coming from Zod schemas are plain strings. */
  message: MessageInput;
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

  /** Message for the client, translated per request locale when the response is built. */
  readonly userMessage: MessageInput;
  readonly details: ErrorDetail[];
  readonly origin: string;
  private readonly codeOverride?: AppErrorCode;

  constructor(message: MessageInput, options: ApiErrorOptions = {}) {
    // `Error.message` stays English so logs are uniform regardless of the caller's language.
    super(translate(message, 'en'));
    this.name = this.constructor.name;
    this.userMessage = message;
    this.details = options.details ?? [];
    this.origin = options.origin ?? APP_ORIGIN;
    this.codeOverride = options.code;
    Error.captureStackTrace(this, this.constructor);
  }

  get errorCode(): AppErrorCode {
    return this.codeOverride ?? this.defaultCode;
  }
}
