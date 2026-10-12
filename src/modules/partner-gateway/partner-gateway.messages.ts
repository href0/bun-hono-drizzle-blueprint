import type { LocalizedMessage } from '../../core/i18n';

export const PARTNER_GATEWAY_MESSAGES = {
  PONG: {
    id: 'Signature partner valid; koneksi berhasil',
    en: 'Partner signature verified; connection works',
  },
  ECHOED: {
    id: 'Signature partner valid; body diterima',
    en: 'Partner signature verified; body received',
  },
} as const satisfies Record<string, LocalizedMessage>;
