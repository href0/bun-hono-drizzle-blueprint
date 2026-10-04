import { sqlClient } from './connection';

/** Probes answer within a load balancer's timeout even when the database hangs (default 2 s). */
export const DB_PING_TIMEOUT_MS = 2000;

/**
 * Pings the database with a low-overhead query. Returns `false` — never throws — on TCP or
 * authentication failures, and when no answer arrives within `timeoutMs` (a black-holed network
 * would otherwise hold the probe until the driver's connect timeout).
 */
export const pingDatabase = async (timeoutMs: number = DB_PING_TIMEOUT_MS): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });

  try {
    const ping = sqlClient`SELECT 1;`.then(
      () => true,
      () => false,
    );
    return await Promise.race([ping, timedOut]);
  } finally {
    clearTimeout(timer);
  }
};
