import type { LocalizedMessage } from '../../core/i18n';

export const AUTH_MESSAGES = {
  LOGGED_IN: { id: 'Login berhasil', en: 'Logged in successfully' },
  REFRESHED: { id: 'Token akses berhasil diperbarui', en: 'Access token refreshed' },
  LOGGED_OUT: { id: 'Logout berhasil', en: 'Logged out successfully' },
  LOGGED_OUT_ALL: {
    id: 'Semua sesi berhasil diakhiri',
    en: 'All sessions have been signed out',
  },
  PROFILE_RETRIEVED: { id: 'Profil berhasil diambil', en: 'Profile retrieved successfully' },
  REGISTERED: { id: 'Registrasi berhasil', en: 'Registered successfully' },
  /** Deliberately the same for an unknown email, a wrong password and an inactive account. */
  INVALID_CREDENTIALS: { id: 'Email atau password salah', en: 'Invalid email or password' },
  LOGIN_LOCKED: {
    id: 'Terlalu banyak percobaan login. Silakan coba lagi nanti',
    en: 'Too many login attempts. Please try again later',
  },
  REFRESH_INVALID: {
    id: 'Sesi tidak valid atau telah berakhir. Silakan login kembali',
    en: 'Session is invalid or has expired. Please log in again',
  },
  REFRESH_REUSED: {
    id: 'Sesi diakhiri karena token lama dipakai ulang. Silakan login kembali',
    en: 'Session ended because an old token was reused. Please log in again',
  },
  EMAIL_TAKEN: {
    id: 'Pengguna dengan email ini sudah ada',
    en: 'User with this email already exists',
  },
  EMAIL_ALREADY_REGISTERED: { id: 'Email sudah terdaftar', en: 'Email is already registered' },
} as const satisfies Record<string, LocalizedMessage>;
