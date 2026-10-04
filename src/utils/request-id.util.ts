/** Characters allowed in an inbound `X-Request-ID`: safe for logs, headers and audit columns. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Accepts the gateway/client `X-Request-ID` only when it is safe to propagate (prevents log
 * injection such as embedded newlines); otherwise a new UUID v7 is generated.
 */
export const resolveRequestId = (
  inbound: string | undefined,
  generate: () => string = () => Bun.randomUUIDv7(),
): string => (inbound !== undefined && SAFE_REQUEST_ID.test(inbound) ? inbound : generate());
