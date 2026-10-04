import type { LocalizedMessage } from '../../core/i18n';

export const USER_MESSAGES = {
  CREATED: { id: 'Pengguna berhasil dibuat', en: 'User created successfully' },
  RETRIEVED: { id: 'Data pengguna berhasil diambil', en: 'User retrieved successfully' },
  LIST_RETRIEVED: { id: 'Daftar pengguna berhasil diambil', en: 'Users retrieved successfully' },
  EXTERNAL_POSTS_RETRIEVED: {
    id: 'Postingan eksternal pengguna berhasil diambil',
    en: 'User external posts retrieved successfully',
  },
  EMAIL_TAKEN: {
    id: 'Pengguna dengan email ini sudah ada',
    en: 'User with this email already exists',
  },
  EMAIL_ALREADY_REGISTERED: { id: 'Email sudah terdaftar', en: 'Email is already registered' },
} as const satisfies Record<string, LocalizedMessage>;

export const userNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Pengguna dengan ID ${id} tidak ditemukan`,
  en: `User with ID ${id} not found`,
});
