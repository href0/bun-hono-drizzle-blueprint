import type { LocalizedMessage } from '../../core/i18n';

export const ORDER_MESSAGES = {
  CREATED: { id: 'Pesanan berhasil dibuat', en: 'Order created successfully' },
  RETRIEVED: { id: 'Data pesanan berhasil diambil', en: 'Order retrieved successfully' },
  LIST_RETRIEVED: { id: 'Daftar pesanan berhasil diambil', en: 'Orders retrieved successfully' },
  UPDATED: { id: 'Pesanan berhasil diperbarui', en: 'Order updated successfully' },
  DELETED: { id: 'Pesanan berhasil dihapus', en: 'Order deleted successfully' },
  RESTORED: { id: 'Pesanan berhasil dipulihkan', en: 'Order restored successfully' },
  ITEMS_RETRIEVED: { id: 'Daftar item berhasil diambil', en: 'Items retrieved successfully' },
  ITEM_CREATED: { id: 'Item berhasil ditambahkan', en: 'Item added successfully' },
  ITEM_UPDATED: { id: 'Item berhasil diperbarui', en: 'Item updated successfully' },
  ITEM_DELETED: { id: 'Item berhasil dihapus', en: 'Item deleted successfully' },
  ITEMS_SAVED: { id: 'Daftar item berhasil disimpan', en: 'Items saved successfully' },
} as const satisfies Record<string, LocalizedMessage>;

export const orderNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Pesanan dengan ID '${id}' tidak ditemukan`,
  en: `Order with ID '${id}' not found`,
});

export const orderItemNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Item dengan ID '${id}' tidak ditemukan`,
  en: `Item with ID '${id}' not found`,
});
