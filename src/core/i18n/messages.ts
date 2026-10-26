import type { LocalizedMessage } from './translate';

/**
 * Cross-cutting messages (envelope defaults, platform endpoints). Domain messages live next to
 * their module in `<module>.messages.ts`. Every entry must define every supported locale —
 * enforced by the `LocalizedMessage` type.
 */
export const I18N_MESSAGES = {
  SUCCESS: { id: 'Berhasil', en: 'Success' },
  SERVICE_ONLINE: { id: 'Layanan aktif', en: 'Service online' },

  VALIDATION_FAILED: {
    id: 'Validasi data gagal. Silakan periksa kembali input Anda',
    en: 'Validation failed. Please check your input',
  },
  INVALID_JSON_BODY: {
    id: 'Body request bukan JSON yang valid',
    en: 'Request body is not valid JSON',
  },
  INVALID_JSON_DETAIL: {
    id: 'Sintaks JSON pada body request tidak valid',
    en: 'Request body contains invalid JSON syntax',
  },
  NON_SNAKE_CASE_KEYS: {
    id: 'Nama field harus snake_case (contoh: full_name)',
    en: 'Field names must be snake_case (e.g. full_name)',
  },
  NON_SNAKE_CASE_KEY_DETAIL: {
    id: 'Gunakan snake_case untuk nama field ini',
    en: 'Use snake_case for this field name',
  },
  BAD_REQUEST: { id: 'Permintaan tidak valid', en: 'Bad request' },
  UNAUTHORIZED: { id: 'Autentikasi diperlukan', en: 'Authentication required' },
  AUTH_TOKEN_EXPIRED: {
    id: 'Sesi telah berakhir. Silakan perbarui token akses',
    en: 'Access token has expired. Please refresh it',
  },
  AUTH_TOKEN_INVALID: { id: 'Token akses tidak valid', en: 'Invalid access token' },
  // partner:start
  PARTNER_HEADERS_MISSING: {
    id: 'Header partner tidak lengkap atau tidak valid (x-partner-key, x-partner-timestamp, x-partner-nonce, x-partner-signature)',
    en: 'Partner headers missing or malformed (x-partner-key, x-partner-timestamp, x-partner-nonce, x-partner-signature)',
  },
  PARTNER_INVALID_KEY: { id: 'API key partner tidak valid', en: 'Invalid partner API key' },
  PARTNER_REPLAY_REJECTED: {
    id: 'Permintaan ditolak: timestamp di luar batas waktu atau nonce sudah dipakai',
    en: 'Request rejected: timestamp outside the allowed window or nonce already used',
  },
  PARTNER_SIGNATURE_INVALID: {
    id: 'Signature partner tidak valid',
    en: 'Invalid partner signature',
  },
  // partner:end
  WEBHOOK_SIGNATURE_INVALID: {
    id: 'Signature webhook tidak valid',
    en: 'Invalid webhook signature',
  },
  FORBIDDEN: { id: 'Akses ditolak', en: 'Access denied' },
  // partner:start
  PARTNER_IP_FORBIDDEN: {
    id: 'Alamat IP tidak diizinkan untuk partner ini',
    en: 'IP address not allowed for this partner',
  },
  PARTNER_ROUTE_FORBIDDEN: {
    id: 'Route ini tidak diizinkan untuk partner ini',
    en: 'This route is not allowed for this partner',
  },
  // partner:end
  ROLE_FORBIDDEN: {
    id: 'Peran Anda tidak memiliki akses ke fitur ini',
    en: 'Your role is not allowed to use this feature',
  },
  CSRF_ORIGIN_FORBIDDEN: {
    id: 'Permintaan ditolak: asal (origin) tidak diizinkan',
    en: 'Request rejected: origin not allowed',
  },
  NOT_FOUND: { id: 'Data tidak ditemukan', en: 'Resource not found' },
  CONFLICT: { id: 'Data bertentangan dengan data yang sudah ada', en: 'Resource conflict' },
  PAYLOAD_TOO_LARGE: { id: 'Ukuran body request terlalu besar', en: 'Request body too large' },
  TOO_MANY_REQUESTS: {
    id: 'Terlalu banyak permintaan. Silakan coba lagi nanti',
    en: 'Too many requests. Please try again later',
  },
  SERVICE_UNAVAILABLE: {
    id: 'Layanan sedang tidak tersedia',
    en: 'Service temporarily unavailable',
  },
  EXTERNAL_SERVICE_FAILED: {
    id: 'Layanan eksternal sedang bermasalah',
    en: 'External service request failed',
  },
  EXTERNAL_TIMEOUT_DETAIL: {
    id: 'Layanan eksternal tidak merespons dalam batas waktu',
    en: 'The external service did not respond in time',
  },
  EXTERNAL_UNREACHABLE_DETAIL: {
    id: 'Layanan eksternal tidak dapat dihubungi',
    en: 'The external service could not be reached',
  },
  EXTERNAL_ERROR_DETAIL: {
    id: 'Layanan eksternal menolak atau gagal memproses permintaan',
    en: 'The external service rejected or failed to process the request',
  },
  INTERNAL_SERVER_ERROR: {
    id: 'Terjadi kesalahan pada server',
    en: 'Internal server error',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const routeNotFoundMessage = (method: string, path: string): LocalizedMessage => ({
  id: `Rute tidak ditemukan: ${method} ${path}`,
  en: `Route not found: ${method} ${path}`,
});
