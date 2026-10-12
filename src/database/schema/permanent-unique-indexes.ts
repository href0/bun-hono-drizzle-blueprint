/**
 * The only plain (not soft-delete aware) unique indexes allowed on soft-deleted tables, by index
 * name, each with the reason.
 *
 * A soft-deleted table normally uses `activeUniqueIndex()`, so a deleted row never blocks
 * re-creating its value. A value listed here is unique forever instead: a deleted row keeps it and
 * it is never reused (e.g. a code that names an audit actor). The schema convention test
 * (schema-conventions.test.ts) fails for an unlisted plain unique and for a stale entry.
 */
export const PERMANENT_UNIQUE_INDEXES: Readonly<Record<string, string>> = {
  partner_credentials_partner_code_uq:
    'partner code is the audit actor (partner:<code>) in created_by/updated_by: never reused, even after a delete',
};
