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
  FORBIDDEN: { id: 'Akses ditolak', en: 'Access denied' },
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
  INTERNAL_SERVER_ERROR: {
    id: 'Terjadi kesalahan pada server',
    en: 'Internal server error',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const routeNotFoundMessage = (method: string, path: string): LocalizedMessage => ({
  id: `Rute tidak ditemukan: ${method} ${path}`,
  en: `Route not found: ${method} ${path}`,
});
