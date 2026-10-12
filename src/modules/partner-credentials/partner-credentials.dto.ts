import { z } from 'zod';
import { isoInstant } from '../../core/openapi';
import { isValidIpRule } from '../../utils/ip-match.util';

/** Lowercase letters, digits and inner hyphens, 3–50 characters: becomes the actor `partner:<code>`. */
const PARTNER_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/**
 * A route pattern relative to `<API_BASE_PATH>/v1/partner` (`matchRoutePattern`): literal segments,
 * `:param` segments and an optional trailing `/*` (`/orders/*` = `/orders` and everything below).
 * `/*` allows every partner route. No query, `.`/`..` or empty segments.
 */
const ROUTE_PATTERN = /^(?:\/(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*|:[A-Za-z][A-Za-z0-9_]*))*(?:\/\*)?$/;

const MAX_LIST_ENTRIES = 100;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const ipRuleField = z.string().trim().toLowerCase().refine(isValidIpRule, {
  message: 'Must be an IPv4/IPv6 address or CIDR block without host bits (e.g. 203.0.113.0/24)',
});

const routePatternField = z
  .string()
  .trim()
  .min(2, 'Route pattern is required')
  .max(255)
  .regex(ROUTE_PATTERN, 'Must look like /orders, /orders/:id or /orders/* (relative to /partner)');

const ipWhitelistField = z.array(ipRuleField).max(MAX_LIST_ENTRIES).transform(unique);
const allowedRoutesField = z
  .array(routePatternField)
  .min(1, 'At least one route pattern is required')
  .max(MAX_LIST_ENTRIES)
  .transform(unique);
const rateLimitRpmField = z.number().int().min(1).max(100_000);
const partnerNameField = z.string().trim().min(1, 'Partner name is required').max(255);

export const createPartnerCredentialSchema = z.object({
  partnerCode: z
    .string()
    .regex(PARTNER_CODE_PATTERN, 'Must be 3-50 lowercase letters, digits or inner hyphens'),
  partnerName: partnerNameField,
  /** Empty or absent = any address. */
  ipWhitelist: ipWhitelistField.default([]),
  allowedRoutes: allowedRoutesField,
  /** Requests per minute for this partner (default 60). */
  rateLimitRpm: rateLimitRpmField.default(60),
});

export type CreatePartnerCredentialDto = z.infer<typeof createPartnerCredentialSchema>;

/** Partial update: only the given fields change. The code is permanent; keys have own endpoints. */
export const updatePartnerCredentialSchema = z
  .object({
    partnerName: partnerNameField,
    ipWhitelist: ipWhitelistField,
    allowedRoutes: allowedRoutesField,
    rateLimitRpm: rateLimitRpmField,
  })
  .partial()
  .refine((dto) => Object.keys(dto).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdatePartnerCredentialDto = z.infer<typeof updatePartnerCredentialSchema>;

/** Response shape: never the API key hash or the encrypted secret. */
export const partnerCredentialResponseSchema = z.object({
  id: z.string().uuid(),
  partnerCode: z.string(),
  partnerName: z.string(),
  /** First characters of the API key, to recognize which key a partner holds. */
  apiKeyPrefix: z.string(),
  ipWhitelist: z.array(z.string()),
  allowedRoutes: z.array(z.string()),
  rateLimitRpm: z.number().int(),
  isActive: z.boolean(),
  createdAt: isoInstant(),
  updatedAt: isoInstant(),
});

export type PartnerCredentialResponse = z.infer<typeof partnerCredentialResponseSchema>;

const apiKeyField = z
  .string()
  .describe('The API key (x-partner-key). Shown only in this response — store it now.');
const secretField = z
  .string()
  .describe('The HMAC signing secret. Shown only in this response — store it now.');

/** Create: the credential plus both values the partner needs, shown exactly once. */
export const issuedPartnerCredentialSchema = partnerCredentialResponseSchema.extend({
  apiKey: apiKeyField,
  secret: secretField,
});

export type IssuedPartnerCredentialResponse = z.infer<typeof issuedPartnerCredentialSchema>;

export const rotatedApiKeySchema = partnerCredentialResponseSchema.extend({ apiKey: apiKeyField });

export type RotatedApiKeyResponse = z.infer<typeof rotatedApiKeySchema>;

export const rotatedSecretSchema = partnerCredentialResponseSchema.extend({ secret: secretField });

export type RotatedSecretResponse = z.infer<typeof rotatedSecretSchema>;
