import type { LocalizedMessage } from '../../core/i18n';

export const PAYMENT_NOTIFICATION_MESSAGES = {
  RECEIVED: { id: 'Notifikasi pembayaran diterima', en: 'Payment notification received' },
  DUPLICATE: {
    id: 'Notifikasi pembayaran ini sudah pernah diterima',
    en: 'This payment notification was already received',
  },
} as const satisfies Record<string, LocalizedMessage>;
