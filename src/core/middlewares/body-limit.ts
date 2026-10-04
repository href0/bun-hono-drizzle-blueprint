import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PayloadTooLargeError } from '../errors';

/**
 * Rejects bodies over `maxBytes` with 413 `ERR_PAYLOAD_TOO_LARGE` in the standard envelope —
 * by `Content-Length` up front, or while streaming when the length is not declared.
 */
export const bodySizeLimit = (maxBytes: number): MiddlewareHandler =>
  bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new PayloadTooLargeError();
    },
  });
