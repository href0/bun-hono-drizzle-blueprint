import type { Context } from 'hono';
import { getConnInfo } from 'hono/bun';
import { isIP } from 'node:net';

/** Socket address unknown: `app.request()` in tests, or a runtime without `requestIP`. */
export const UNKNOWN_CLIENT_IP = 'unknown';

const IPV4_MAPPED_PREFIX = '::ffff:';

/** `::ffff:203.0.113.7` → `203.0.113.7`, so one client never counts as two. */
export const normalizeIp = (ip: string): string => {
  const lower = ip.trim().toLowerCase();
  const unmapped = lower.startsWith(IPV4_MAPPED_PREFIX)
    ? lower.slice(IPV4_MAPPED_PREFIX.length)
    : lower;
  return isIP(unmapped) === 4 ? unmapped : lower;
};

/**
 * Picks the client IP without trusting anything the client can forge.
 *
 * - `trustProxyHops = 0`: the socket address; `X-Forwarded-For` is ignored entirely.
 * - `trustProxyHops = n`: each trusted proxy appends the address it saw, so the n-th entry from
 *   the right is the last one written by our own infrastructure. Entries further left are
 *   client-controlled. A shorter chain falls back to its leftmost entry; a malformed entry falls
 *   back to the socket address.
 */
export const selectClientIp = (
  socketIp: string | undefined,
  forwardedFor: string | undefined,
  trustProxyHops: number,
): string => {
  const fallback = socketIp ? normalizeIp(socketIp) : UNKNOWN_CLIENT_IP;
  if (trustProxyHops === 0 || !forwardedFor) return fallback;

  const chain = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = chain.at(Math.max(chain.length - trustProxyHops, 0));
  if (candidate === undefined || isIP(candidate) === 0) return fallback;
  return normalizeIp(candidate);
};

const socketAddress = (c: Context): string | undefined => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
};

export const resolveClientIp = (c: Context, trustProxyHops: number): string =>
  selectClientIp(socketAddress(c), c.req.header('X-Forwarded-For'), trustProxyHops);
