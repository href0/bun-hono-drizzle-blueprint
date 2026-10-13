import type { LocalizedMessage } from '../../core/i18n';

export const PROJECT_MESSAGES = {
  CREATED: { id: 'Proyek berhasil dibuat', en: 'Project created successfully' },
  RETRIEVED: { id: 'Data proyek berhasil diambil', en: 'Project retrieved successfully' },
  LIST_RETRIEVED: {
    id: 'Daftar proyek berhasil diambil',
    en: 'Projects retrieved successfully',
  },
  UPDATED: { id: 'Proyek berhasil diperbarui', en: 'Project updated successfully' },
  DELETED: { id: 'Proyek berhasil dihapus', en: 'Project deleted successfully' },
  RESTORED: { id: 'Proyek berhasil dipulihkan', en: 'Project restored successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const projectNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Proyek dengan ID '${id}' tidak ditemukan`,
  en: `Project with ID '${id}' not found`,
});
