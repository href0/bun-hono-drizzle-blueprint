import { appConfig } from '../../config';
import { getEndpointContract } from '../context/request-context';
import { ERROR_CATALOG } from '../errors/error-catalog';
import { APP_ERROR_CODES, type AppErrorCode } from '../errors/error-codes';
import type { MessageInput } from '../i18n/translate';
import { logger } from '../logger/logger';

/**
 * The contract guard runs only under `NODE_ENV=test`: every e2e / integration test that reaches a
 * route then proves the response matches what the route documents (`describeEndpoint()`), so the
 * generated API contract cannot promise one message or error code and send another. Production
 * pays nothing. Only the paths the tests execute are proven.
 */
export const CONTRACT_CHECKS = appConfig.NODE_ENV === 'test';

/**
 * Codes sent by the platform's own middlewares (validation, authentication, partner / webhook
 * verification, roles, CSRF, body limit, rate limits, 404 route, error handler). Each documents
 * itself on the routes it guards, so they are allowed on any route; domain codes must be listed
 * by the route's `describeEndpoint({ errors })`.
 */
const PLATFORM_CODES: ReadonlySet<AppErrorCode> = new Set([
  APP_ERROR_CODES.INVALID_INPUT,
  APP_ERROR_CODES.INVALID_JSON,
  APP_ERROR_CODES.NON_SNAKE_CASE_KEY,
  APP_ERROR_CODES.UNAUTHORIZED,
  APP_ERROR_CODES.AUTH_TOKEN_EXPIRED,
  APP_ERROR_CODES.AUTH_TOKEN_INVALID,
  APP_ERROR_CODES.PARTNER_HEADERS_MISSING,
  APP_ERROR_CODES.PARTNER_INVALID_KEY,
  APP_ERROR_CODES.PARTNER_REPLAY_REJECTED,
  APP_ERROR_CODES.PARTNER_SIGNATURE_INVALID,
  APP_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
  APP_ERROR_CODES.ROLE_FORBIDDEN,
  APP_ERROR_CODES.CSRF_ORIGIN_FORBIDDEN,
  APP_ERROR_CODES.PARTNER_IP_FORBIDDEN,
  APP_ERROR_CODES.PARTNER_ROUTE_FORBIDDEN,
  APP_ERROR_CODES.ROUTE_NOT_FOUND,
  APP_ERROR_CODES.PAYLOAD_TOO_LARGE,
  APP_ERROR_CODES.RATE_LIMITED,
  APP_ERROR_CODES.INTERNAL,
]);

const sameMessage = (sent: MessageInput, documented: MessageInput): boolean =>
  typeof sent === 'string' || typeof documented === 'string'
    ? sent === documented
    : Object.entries(documented).every(
        ([locale, text]) => new Map(Object.entries(sent)).get(locale) === text,
      );

/** Why a success response breaks the route's documented contract, or `undefined`. */
export const successViolation = (status: number, message: MessageInput): string | undefined => {
  const contract = getEndpointContract();
  if (!contract) return undefined;
  const messages = contract.successMessages.get(status);
  if (!messages) {
    const documented = [...contract.successMessages.keys()].join(' / ');
    return `"${contract.summary}" answered ${String(status)}, documented ${documented}`;
  }
  if (!messages.some((documented) => sameMessage(message, documented))) {
    return `"${contract.summary}" sent a success message other than its documented response.message`;
  }
  return undefined;
};

/** Why an error response breaks the error catalog or the route's documented codes, or `undefined`. */
export const errorViolation = (
  status: number,
  code: AppErrorCode,
  type: string,
): string | undefined => {
  const entry = ERROR_CATALOG[code];
  if (entry.status !== status || entry.type !== type) {
    return `${code} sent as ${String(status)} ${type}; ERROR_CATALOG says ${String(entry.status)} ${entry.type}`;
  }
  const contract = getEndpointContract();
  if (!contract || PLATFORM_CODES.has(code)) return undefined;
  if (contract.errorCodes.get(status)?.has(code)) return undefined;
  return `"${contract.summary}" sent ${String(status)} ${code}, not documented in describeEndpoint({ errors })`;
};

/**
 * Logged at `fatal`: tests run with `LOG_LEVEL=fatal`, and the failing request is answered 500,
 * so the reason must be visible next to the failed assertion.
 */
export const reportViolation = (violation: string): void => {
  logger.fatal({ violation }, 'API contract violation');
};
