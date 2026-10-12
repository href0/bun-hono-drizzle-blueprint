import type { LocalizedMessage } from '../../core/i18n';

export const PARTNER_CREDENTIAL_MESSAGES = {
  CREATED: {
    id: 'Kredensial partner berhasil dibuat; simpan API key dan secret sekarang, keduanya tidak ditampilkan lagi',
    en: 'Partner credential created; store the API key and secret now, they are not shown again',
  },
  RETRIEVED: {
    id: 'Data kredensial partner berhasil diambil',
    en: 'Partner credential retrieved successfully',
  },
  LIST_RETRIEVED: {
    id: 'Daftar kredensial partner berhasil diambil',
    en: 'Partner credentials retrieved successfully',
  },
  UPDATED: {
    id: 'Kredensial partner berhasil diperbarui',
    en: 'Partner credential updated successfully',
  },
  DELETED: {
    id: 'Kredensial partner berhasil dihapus',
    en: 'Partner credential deleted successfully',
  },
  RESTORED: {
    id: 'Kredensial partner berhasil dipulihkan',
    en: 'Partner credential restored successfully',
  },
  ACTIVATED: { id: 'Kredensial partner diaktifkan', en: 'Partner credential activated' },
  DEACTIVATED: { id: 'Kredensial partner dinonaktifkan', en: 'Partner credential deactivated' },
  SECRET_ROTATED: {
    id: 'Secret partner diganti; secret lama langsung tidak berlaku. Simpan secret baru sekarang',
    en: 'Partner secret rotated; the old secret stops working now. Store the new secret now',
  },
  API_KEY_ROTATED: {
    id: 'API key partner diganti; key lama langsung tidak berlaku. Simpan API key baru sekarang',
    en: 'Partner API key rotated; the old key stops working now. Store the new key now',
  },
  CODE_TAKEN: {
    id: 'Kode partner ini sudah pernah dipakai',
    en: 'This partner code has already been used',
  },
  CODE_NOT_REUSABLE: {
    id: 'Kode partner bersifat permanen dan tidak dapat dipakai ulang, termasuk dari kredensial yang sudah dihapus',
    en: 'Partner codes are permanent and cannot be reused, including those of deleted credentials',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const partnerCredentialNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Kredensial partner dengan ID ${id} tidak ditemukan`,
  en: `Partner credential with ID ${id} not found`,
});
