import { jsonb, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { sequentialPrimaryKey, timestamps } from '../columns';
import { appTable } from '../schemas';

/**
 * Inbox of vendor webhook events (plan D23, D28): one row per `(vendor, event_id)`. Vendors send
 * the same event again when they do not get a 2xx in time; the unique index turns that retry into
 * a no-op. The receiving service inserts the event and processes it in one transaction, so a
 * failed processing leaves no row and the vendor's retry is processed again.
 *
 * Append-only (APPEND_ONLY_TABLES): written once, never updated; `created_at` = when received.
 */
export const webhookEvents = appTable(
  'webhook_events',
  {
    id: sequentialPrimaryKey(),
    /** `WebhookVendor.vendor` (URL segment), e.g. `demo-pay`. */
    vendor: varchar('vendor', { length: 50 }).notNull(),
    /** The vendor's own id of the event (the deduplication key). */
    eventId: varchar('event_id', { length: 200 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    /** The validated payload as the vendor sent it. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex('webhook_events_vendor_event_uq').on(table.vendor, table.eventId)],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
