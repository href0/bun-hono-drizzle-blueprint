const UNIQUE_VIOLATION = '23505';

const sqlStateOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

/**
 * True for a PostgreSQL unique violation (SQLSTATE 23505) — e.g. two requests creating the same
 * email at once, or restoring a soft-deleted row whose value a live row took meanwhile
 * (`activeUniqueIndex`). Services map it to a `ConflictError`; the driver error itself never
 * reaches the client. Looks one level into `cause` for wrapped errors.
 */
export const isUniqueViolation = (error: unknown): boolean =>
  sqlStateOf(error) === UNIQUE_VIOLATION ||
  (typeof error === 'object' &&
    error !== null &&
    sqlStateOf((error as { cause?: unknown }).cause) === UNIQUE_VIOLATION);
