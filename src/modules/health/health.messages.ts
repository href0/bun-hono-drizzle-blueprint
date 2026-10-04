import type { LocalizedMessage } from '../../core/i18n';

export const HEALTH_MESSAGES = {
  UP: { id: 'Layanan berjalan normal', en: 'Service is healthy' },
  DEGRADED: {
    id: 'Layanan berjalan dengan fungsi terbatas',
    en: 'Service is running in degraded mode',
  },
  DOWN: { id: 'Layanan tidak sehat', en: 'Service is unhealthy' },
  ALIVE: { id: 'Proses layanan aktif', en: 'Service process is alive' },
  READY: { id: 'Layanan siap menerima permintaan', en: 'Service is ready' },
  NOT_READY: {
    id: 'Layanan belum siap menerima permintaan',
    en: 'Service is not ready to accept requests',
  },
  DATABASE_UNAVAILABLE: { id: 'Database tidak tersedia', en: 'Database is unavailable' },
} as const satisfies Record<string, LocalizedMessage>;
