import type { MiddlewareHandler } from 'hono';
import { APP_ERROR_CODES, ForbiddenError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { currentPartner } from './partner-auth';
import { documentsForbidden } from './require-role';

/**
 * Allows a partner route only to the given partner codes (D27), on top of the credential's
 * `allowed_routes`: an admin who grants the pattern to another partner by mistake still does not
 * open the route. Another partner → 403 `ERR_PARTNER_ROUTE_FORBIDDEN` (documented in OpenAPI).
 * Runs after `partnerAuth()`; without a verified partner it answers 401.
 */
export const requirePartner = (...codes: [string, ...string[]]): MiddlewareHandler =>
  documentsForbidden(
    async (_c, next) => {
      if (!codes.includes(currentPartner().code)) {
        throw new ForbiddenError(I18N_MESSAGES.PARTNER_ROUTE_FORBIDDEN, {
          code: APP_ERROR_CODES.PARTNER_ROUTE_FORBIDDEN,
        });
      }
      await next();
    },
    APP_ERROR_CODES.PARTNER_ROUTE_FORBIDDEN,
    codes.map((code) => `partner:${code}`),
  );
