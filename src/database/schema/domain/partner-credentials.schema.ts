import { boolean, integer, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import {
  activeUniqueIndex,
  auditColumns,
  softDelete,
  timestamps,
  uuidPrimaryKey,
} from '../columns';
import { appTable } from '../schemas';

/**
 * Inbound partner credentials (standalone table, BaseRepository). A partner signs each request with
 * its API key + HMAC secret (signing spec v1, `partner-signature.util.ts`):
 * - the API key is stored only as its SHA-256 (`api_key_hash`, the lookup) plus a short prefix to
 *   recognize it in lists;
 * - the HMAC secret must be read back to verify signatures, so it is encrypted at rest
 *   (`encrypted_secret`, AES-256-GCM payload of `secret-cipher.util.ts`, keyring PARTNER_SECRET_*).
 * Neither leaves the API after the create / rotation response, nor reaches record_changes.
 */
export const partnerCredentials = appTable(
  'partner_credentials',
  {
    id: uuidPrimaryKey(),
    /** Permanent: names the audit actor `partner:<code>`, never reused (PERMANENT_UNIQUE_INDEXES). */
    partnerCode: varchar('partner_code', { length: 50 }).notNull(),
    partnerName: varchar('partner_name', { length: 255 }).notNull(),
    apiKeyHash: varchar('api_key_hash', { length: 64 }).notNull(),
    apiKeyPrefix: varchar('api_key_prefix', { length: 16 }).notNull(),
    encryptedSecret: text('encrypted_secret').notNull(),
    /** IP addresses / CIDR blocks the partner may call from; empty = any address. */
    ipWhitelist: text('ip_whitelist').array().notNull().default([]),
    /** Route patterns under `<API_BASE_PATH>/v1/partner` (`matchRoutePattern`). */
    allowedRoutes: text('allowed_routes').array().notNull().default([]),
    rateLimitRpm: integer('rate_limit_rpm').notNull().default(60),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
    ...auditColumns(),
    ...softDelete(),
  },
  (table) => [
    uniqueIndex('partner_credentials_partner_code_uq').on(table.partnerCode),
    activeUniqueIndex('partner_credentials_api_key_hash_uq', [table.apiKeyHash], table.deletedAt),
  ],
);

export type PartnerCredential = typeof partnerCredentials.$inferSelect;
export type NewPartnerCredential = typeof partnerCredentials.$inferInsert;
