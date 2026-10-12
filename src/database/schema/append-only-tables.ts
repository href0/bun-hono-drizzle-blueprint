/**
 * The only tables allowed to use `sequentialPrimaryKey()` (bigint identity), each with the reason.
 *
 * Everything else uses `uuidPrimaryKey()` (UUID v7). Sequential ids are for high-volume,
 * append-only records — audit trails, logs, history — that are never addressed by id in a public
 * URL. The schema convention test (schema-conventions.test.ts) fails for an unlisted table using a sequential
 * key and for a listed table that does not use one (stale entry).
 */
export const APPEND_ONLY_TABLES: Readonly<Record<string, string>> = {
  record_changes: 'audit trail: append-only, written in every audited transaction, partition-ready',
  webhook_events:
    'vendor webhook inbox: one row per (vendor, event_id), written once, never addressed by id',
};
