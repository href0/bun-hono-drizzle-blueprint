import type { MessageInput } from '../i18n/translate';
import { ApiError, type ApiErrorOptions } from './api-error';
import { APP_ERROR_CODES, ERROR_TYPES, type AppErrorCode } from './error-codes';

/** Failure class of an outbound call; the vendor's own HTTP status is never forwarded. */
export type ExternalFailureKind = 'TIMEOUT' | 'UNREACHABLE' | 'ERROR';

/** An external system, as registered in `INTEGRATION_REGISTRY` (src/integrations/registry.ts). */
export interface IntegrationIdentity {
  /** Stable code sent as `error.origin` (e.g. `ACME_PAY`). */
  readonly code: string;
  /** Human-readable name sent as `error.institution` (e.g. `Acme Pay`). */
  readonly institution: string;
}

const FAILURES: Record<ExternalFailureKind, { statusCode: number; code: AppErrorCode }> = {
  TIMEOUT: { statusCode: 504, code: APP_ERROR_CODES.EXT_TIMEOUT },
  UNREACHABLE: { statusCode: 502, code: APP_ERROR_CODES.EXT_UNREACHABLE },
  ERROR: { statusCode: 502, code: APP_ERROR_CODES.EXT_ERROR },
};

export interface ExternalServiceErrorOptions extends Omit<ApiErrorOptions, 'code' | 'origin'> {
  /** The external system that failed: its code becomes `error.origin`, its name `error.institution`. */
  integration: IntegrationIdentity;
  /** The vendor's HTTP status, for decisions in the adapter (e.g. log in again on 401). Never sent. */
  vendorStatus?: number;
}

export class ExternalServiceError extends ApiError {
  readonly statusCode: number;
  readonly errorType = ERROR_TYPES.EXTERNAL_SERVICE_ERROR;
  protected readonly defaultCode: AppErrorCode;
  readonly kind: ExternalFailureKind;
  readonly institution: string;
  readonly vendorStatus?: number;

  constructor(
    kind: ExternalFailureKind,
    message: MessageInput,
    { integration, vendorStatus, ...options }: ExternalServiceErrorOptions,
  ) {
    super(message, { ...options, origin: integration.code });
    this.kind = kind;
    this.institution = integration.institution;
    this.vendorStatus = vendorStatus;
    this.statusCode = FAILURES[kind].statusCode;
    this.defaultCode = FAILURES[kind].code;
  }
}
