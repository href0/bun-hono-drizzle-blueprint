import type { LocalizedMessage } from '../../../core/i18n';

export const PROJECT_TASK_MESSAGES = {
  CREATED: { id: 'Tugas berhasil dibuat', en: 'Task created successfully' },
  RETRIEVED: { id: 'Data tugas berhasil diambil', en: 'Task retrieved successfully' },
  LIST_RETRIEVED: {
    id: 'Daftar tugas berhasil diambil',
    en: 'Tasks retrieved successfully',
  },
  UPDATED: { id: 'Tugas berhasil diperbarui', en: 'Task updated successfully' },
  DELETED: { id: 'Tugas berhasil dihapus', en: 'Task deleted successfully' },
  RESTORED: { id: 'Tugas berhasil dipulihkan', en: 'Task restored successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const projectTaskNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Tugas dengan ID '${id}' tidak ditemukan`,
  en: `Task with ID '${id}' not found`,
});
