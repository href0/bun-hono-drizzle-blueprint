import type { LocalizedMessage } from '../i18n/translate';
import {
  APP_ERROR_CODES as CODE,
  ERROR_TYPES as TYPE,
  type AppErrorCode,
  type ErrorType,
} from './error-codes';

export interface ErrorCodeEntry {
  status: number;
  type: ErrorType;
  /** What the code means for an integrator (generated API contract, `docs/api/README.md`). */
  meaning: LocalizedMessage;
}

/**
 * Every error code with the HTTP status and `error.type` it is sent with — the error classes
 * decide both at runtime; this table states them once for the contract documentation, and the
 * contract guard (`NODE_ENV=test`) fails a response whose code, status and type disagree with it.
 */
export const ERROR_CATALOG: Readonly<Record<AppErrorCode, ErrorCodeEntry>> = {
  [CODE.INVALID_INPUT]: {
    status: 400,
    type: TYPE.VALIDATION_ERROR,
    meaning: {
      id: 'Input tidak memenuhi skema (lihat `details`)',
      en: 'Input does not match the schema (see `details`)',
    },
  },
  [CODE.INVALID_JSON]: {
    status: 400,
    type: TYPE.VALIDATION_ERROR,
    meaning: { id: 'Body bukan JSON yang valid', en: 'The body is not valid JSON' },
  },
  [CODE.NON_SNAKE_CASE_KEY]: {
    status: 400,
    type: TYPE.VALIDATION_ERROR,
    meaning: {
      id: 'Key body / query bukan snake_case (`field` = key seperti dikirim)',
      en: 'A body / query key is not snake_case (`field` = the key as sent)',
    },
  },
  [CODE.BAD_REQUEST]: {
    status: 400,
    type: TYPE.BAD_REQUEST,
    meaning: { id: 'Aturan bisnis dilanggar', en: 'A business rule was violated' },
  },
  [CODE.UNAUTHORIZED]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Header `Authorization: Bearer` tidak ada',
      en: 'No `Authorization: Bearer` header',
    },
  },
  [CODE.AUTH_TOKEN_EXPIRED]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Access token kedaluwarsa: refresh lalu ulangi',
      en: 'The access token expired: refresh, then retry',
    },
  },
  [CODE.AUTH_TOKEN_INVALID]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: { id: 'Access token tidak valid', en: 'The access token is invalid' },
  },
  [CODE.AUTH_INVALID_CREDENTIALS]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Email atau password salah (sengaja tidak dibedakan)',
      en: 'Wrong email or password (deliberately not distinguished)',
    },
  },
  [CODE.AUTH_REFRESH_INVALID]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Refresh token tidak ada, kedaluwarsa, atau sudah dicabut: login ulang',
      en: 'The refresh token is missing, expired or revoked: log in again',
    },
  },
  [CODE.AUTH_REFRESH_REUSED]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Refresh token lama dipakai ulang: seluruh sesi dicabut',
      en: 'An old refresh token was reused: the whole session was revoked',
    },
  },
  // partner:start
  [CODE.PARTNER_HEADERS_MISSING]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Header `x-partner-*` tidak ada atau formatnya salah',
      en: 'An `x-partner-*` header is missing or malformed',
    },
  },
  [CODE.PARTNER_INVALID_KEY]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'API key partner tidak dikenal atau nonaktif',
      en: 'Unknown or inactive partner API key',
    },
  },
  [CODE.PARTNER_REPLAY_REJECTED]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Timestamp di luar toleransi atau nonce sudah dipakai',
      en: 'Timestamp outside the tolerance, or nonce already used',
    },
  },
  [CODE.PARTNER_SIGNATURE_INVALID]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: { id: 'Signature partner tidak cocok', en: 'The partner signature does not match' },
  },
  // partner:end
  [CODE.WEBHOOK_SIGNATURE_INVALID]: {
    status: 401,
    type: TYPE.UNAUTHORIZED,
    meaning: {
      id: 'Signature webhook vendor tidak ada atau tidak cocok',
      en: 'The vendor webhook signature is missing or does not match',
    },
  },
  [CODE.FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: { id: 'Akses ditolak', en: 'Access denied' },
  },
  [CODE.CSRF_ORIGIN_FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: {
      id: '`Origin` tidak diizinkan untuk endpoint ber-cookie (CSRF)',
      en: '`Origin` not allowed on a cookie endpoint (CSRF)',
    },
  },
  [CODE.ROLE_FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: {
      id: 'Role pengguna tidak diizinkan untuk endpoint ini',
      en: 'The user role is not allowed on this endpoint',
    },
  },
  [CODE.SELF_LOCKOUT_FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: {
      id: 'Admin tidak bisa menghapus, menonaktifkan, atau menurunkan role akunnya sendiri',
      en: 'An admin cannot delete, deactivate or demote their own account',
    },
  },
  // partner:start
  [CODE.PARTNER_IP_FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: {
      id: 'IP pemanggil tidak ada di `ip_whitelist` partner',
      en: 'The caller IP is not in the partner `ip_whitelist`',
    },
  },
  [CODE.PARTNER_ROUTE_FORBIDDEN]: {
    status: 403,
    type: TYPE.FORBIDDEN,
    meaning: {
      id: 'Route tidak termasuk `allowed_routes` partner (atau khusus partner lain)',
      en: 'The route is not in the partner `allowed_routes` (or reserved for another partner)',
    },
  },
  // partner:end
  [CODE.NOT_FOUND]: {
    status: 404,
    type: TYPE.NOT_FOUND,
    meaning: { id: 'Data tidak ditemukan', en: 'Not found' },
  },
  [CODE.ROUTE_NOT_FOUND]: {
    status: 404,
    type: TYPE.NOT_FOUND,
    meaning: { id: 'Route tidak ada', en: 'No such route' },
  },
  [CODE.CONFLICT]: {
    status: 409,
    type: TYPE.CONFLICT,
    meaning: {
      id: 'Bentrok dengan data yang ada (mis. nilai unik sudah dipakai)',
      en: 'Conflicts with existing data (e.g. a unique value is taken)',
    },
  },
  [CODE.PAYLOAD_TOO_LARGE]: {
    status: 413,
    type: TYPE.PAYLOAD_TOO_LARGE,
    meaning: {
      id: 'Body melebihi `HTTP_BODY_LIMIT_BYTES`',
      en: 'The body is over `HTTP_BODY_LIMIT_BYTES`',
    },
  },
  [CODE.RATE_LIMITED]: {
    status: 429,
    type: TYPE.TOO_MANY_REQUESTS,
    meaning: {
      id: 'Batas request terlampaui: tunggu `Retry-After` detik',
      en: 'Rate limit exceeded: wait `Retry-After` seconds',
    },
  },
  [CODE.AUTH_LOGIN_LOCKED]: {
    status: 429,
    type: TYPE.TOO_MANY_REQUESTS,
    meaning: {
      id: 'Terlalu banyak percobaan login untuk email ini dari klien ini',
      en: 'Too many login attempts for this email from this client',
    },
  },
  [CODE.SERVICE_UNAVAILABLE]: {
    status: 503,
    type: TYPE.SERVICE_UNAVAILABLE,
    meaning: {
      id: 'Dependensi inti (database) tidak tersedia',
      en: 'A core dependency (database) is unavailable',
    },
  },
  [CODE.EXT_ERROR]: {
    status: 502,
    type: TYPE.EXTERNAL_SERVICE_ERROR,
    meaning: {
      id: 'Layanan vendor menjawab dengan error',
      en: 'The vendor service answered with an error',
    },
  },
  [CODE.EXT_UNREACHABLE]: {
    status: 502,
    type: TYPE.EXTERNAL_SERVICE_ERROR,
    meaning: {
      id: 'Layanan vendor tidak bisa dihubungi',
      en: 'The vendor service could not be reached',
    },
  },
  [CODE.EXT_TIMEOUT]: {
    status: 504,
    type: TYPE.EXTERNAL_SERVICE_ERROR,
    meaning: {
      id: 'Layanan vendor tidak menjawab tepat waktu',
      en: 'The vendor service timed out',
    },
  },
  [CODE.INTERNAL]: {
    status: 500,
    type: TYPE.INTERNAL_SERVER_ERROR,
    meaning: {
      id: 'Error tak terduga di server (detail tidak pernah dikirim)',
      en: 'Unexpected server error (details are never sent)',
    },
  },
};
