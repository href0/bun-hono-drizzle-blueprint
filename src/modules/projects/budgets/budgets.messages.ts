import type { LocalizedMessage } from '../../../core/i18n';

export const BUDGET_MESSAGES = {
  CREATED: { id: 'Anggaran berhasil dibuat', en: 'Budget created successfully' },
  RETRIEVED: { id: 'Data anggaran berhasil diambil', en: 'Budget retrieved successfully' },
  UPDATED: { id: 'Anggaran berhasil diperbarui', en: 'Budget updated successfully' },
  DELETED: { id: 'Anggaran berhasil dihapus', en: 'Budget deleted successfully' },
  RESTORED: { id: 'Anggaran berhasil dipulihkan', en: 'Budget restored successfully' },
  ALREADY_EXISTS: {
    id: 'Anggaran lain yang aktif sudah ada untuk proyek ini',
    en: 'Another live Budget already exists for this record',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const budgetNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Anggaran dengan ID '${id}' tidak ditemukan`,
  en: `Budget with ID '${id}' not found`,
});

export const budgetMissingMessage = (projectId: string): LocalizedMessage => ({
  id: `Anggaran untuk proyek '${projectId}' belum ada`,
  en: `No Budget for '${projectId}' yet`,
});
