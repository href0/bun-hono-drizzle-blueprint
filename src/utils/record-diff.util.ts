/**
 * Pure helpers for the audit trail (plan D16): what changed between two versions of a row, and a
 * full snapshot of a row. Values are normalized to their JSON form (`Temporal` → ISO string, via
 * `toJSON`), so comparison and storage in `jsonb` agree.
 */

export const REDACTED = '[REDACTED]';

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface RecordDiffOptions {
  /** Keys whose values are never stored: recorded as `[REDACTED]` (a change is still recorded). */
  redact?: readonly string[];
  /** Keys never compared (e.g. `updatedAt`, which changes on every update). */
  ignore?: readonly string[];
}

const toJsonValue = (value: unknown): unknown => {
  if (value === undefined) return null;
  // One round trip applies every nested toJSON (Temporal, Date) and drops undefined members.
  return JSON.parse(JSON.stringify(value)) as unknown;
};

/** JSON text with object keys sorted: `jsonb` does not keep key order, so order is no change. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, member: unknown) =>
    member !== null && typeof member === 'object' && !Array.isArray(member)
      ? Object.fromEntries(Object.entries(member).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : member,
  );

const isSame = (left: unknown, right: unknown): boolean =>
  canonical(toJsonValue(left)) === canonical(toJsonValue(right));

/**
 * Changes from `before` to `after`, for the keys present in `after` (a patch: `undefined` means
 * "not set" and is skipped). Unchanged and ignored keys are left out, so an update that changes
 * nothing yields `{}`.
 */
export const diffRecords = (
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  options: RecordDiffOptions = {},
): Record<string, FieldChange> => {
  const changes: Record<string, FieldChange> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined || options.ignore?.includes(key)) continue;
    const previous = before[key];
    if (isSame(previous, next)) continue;
    changes[key] = options.redact?.includes(key)
      ? { from: REDACTED, to: REDACTED }
      : { from: toJsonValue(previous), to: toJsonValue(next) };
  }
  return changes;
};

/** Every key of `record` in JSON form, redacted keys as `[REDACTED]` (the row before a hard delete). */
export const snapshotRecord = (
  record: Readonly<Record<string, unknown>>,
  options: Pick<RecordDiffOptions, 'redact'> = {},
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      options.redact?.includes(key) ? REDACTED : toJsonValue(value),
    ]),
  );
