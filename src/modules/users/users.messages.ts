import type { LocalizedMessage } from '../../core/i18n';

export const USER_MESSAGES = {
  CREATED: { id: 'Pengguna berhasil dibuat', en: 'User created successfully' },
  RETRIEVED: { id: 'Data pengguna berhasil diambil', en: 'User retrieved successfully' },
  LIST_RETRIEVED: { id: 'Daftar pengguna berhasil diambil', en: 'Users retrieved successfully' },
  UPDATED: { id: 'Pengguna berhasil diperbarui', en: 'User updated successfully' },
  DELETED: { id: 'Pengguna berhasil dihapus', en: 'User deleted successfully' },
  RESTORED: { id: 'Pengguna berhasil dipulihkan', en: 'User restored successfully' },
  EMAIL_TAKEN: {
    id: 'Pengguna dengan email ini sudah ada',
    en: 'User with this email already exists',
  },
  EMAIL_ALREADY_REGISTERED: { id: 'Email sudah terdaftar', en: 'Email is already registered' },
  PASSWORD_SET: {
    id: 'Password berhasil diganti; semua sesi pengguna diakhiri',
    en: "Password changed; all of the user's sessions have ended",
  },
  SELF_LOCKOUT: {
    id: 'Anda tidak dapat menghapus, menonaktifkan, atau mencabut peran admin akun Anda sendiri',
    en: 'You cannot delete, deactivate or remove the admin role of your own account',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const userNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Pengguna dengan ID ${id} tidak ditemukan`,
  en: `User with ID ${id} not found`,
});
