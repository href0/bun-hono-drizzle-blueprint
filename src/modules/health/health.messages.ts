import type { LocalizedMessage } from '../../core/i18n';

export const HEALTH_MESSAGES = {
  HEALTHY: { id: 'Layanan berjalan normal', en: 'Service is healthy' },
  READY: { id: 'Layanan siap menerima permintaan', en: 'Service is ready' },
  DATABASE_UNAVAILABLE: { id: 'Database tidak tersedia', en: 'Service database unavailable' },
} as const satisfies Record<string, LocalizedMessage>;
