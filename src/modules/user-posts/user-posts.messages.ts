import type { LocalizedMessage } from '../../core/i18n';

export const USER_POST_MESSAGES = {
  EXTERNAL_POSTS_RETRIEVED: {
    id: 'Postingan eksternal pengguna berhasil diambil',
    en: 'User external posts retrieved successfully',
  },
} as const satisfies Record<string, LocalizedMessage>;
