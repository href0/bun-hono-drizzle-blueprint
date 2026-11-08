import type { LocalizedMessage } from '../../core/i18n';

export const RBAC_MESSAGES = {
  SUPER_ADMIN_FIXED: {
    id: 'Role super admin memiliki semua permission dan tidak dapat diubah',
    en: 'The super admin role holds every permission and cannot be changed',
  },
  SYSTEM_ROLE_FIXED: {
    id: 'Role sistem tidak dapat dihapus',
    en: 'A system role cannot be deleted',
  },
  API_PERMISSION_FIXED: {
    id: 'Permission API diatur oleh kode aplikasi dan tidak dapat diubah lewat API',
    en: 'API permissions come from the application code and cannot be changed through the API',
  },
  PERMISSION_ESCALATION: {
    id: 'Anda tidak dapat memberikan permission yang tidak Anda miliki',
    en: 'You cannot give a permission you do not hold',
  },
  ROLE_KEY_TAKEN: {
    id: 'Kunci role sudah dipakai role lain',
    en: 'The role key is already used by another role',
  },
  PERMISSION_KEY_TAKEN: {
    id: 'Kunci permission sudah dipakai permission lain',
    en: 'The permission key is already used by another permission',
  },
  LAST_SUPER_ADMIN: {
    id: 'Super admin aktif terakhir tidak dapat dicabut',
    en: 'The last active super admin cannot be revoked',
  },
  OWN_SUPER_ADMIN: {
    id: 'Anda tidak dapat mencabut role super admin dari akun Anda sendiri',
    en: 'You cannot revoke the super admin role from your own account',
  },
  USER_ROLES_RETRIEVED: {
    id: 'Daftar role pengguna berhasil diambil',
    en: 'The roles of the user retrieved successfully',
  },
  USER_ROLE_ASSIGNED: {
    id: 'Role berhasil diberikan ke pengguna',
    en: 'Role given to the user',
  },
  USER_ROLE_REVOKED: {
    id: 'Role berhasil dicabut dari pengguna',
    en: 'Role revoked from the user',
  },
  USER_PERMISSIONS_RETRIEVED: {
    id: 'Daftar izin tambahan pengguna berhasil diambil',
    en: 'The extra permissions of the user retrieved successfully',
  },
  USER_PERMISSION_GRANTED: {
    id: 'Izin tambahan berhasil diberikan',
    en: 'Extra permission granted',
  },
  USER_PERMISSION_UPDATED: {
    id: 'Masa berlaku dan catatan izin tambahan berhasil diperbarui',
    en: 'Expiry and note of the extra permission updated',
  },
  USER_PERMISSION_REVOKED: {
    id: 'Izin tambahan berhasil dicabut',
    en: 'Extra permission revoked',
  },
  MY_PERMISSIONS_RETRIEVED: {
    id: 'Permission Anda berhasil diambil',
    en: 'Your permissions retrieved successfully',
  },
  ROLE_CREATED: { id: 'Role berhasil dibuat', en: 'Role created successfully' },
  ROLE_RETRIEVED: { id: 'Role berhasil diambil', en: 'Role retrieved successfully' },
  ROLE_LIST_RETRIEVED: {
    id: 'Daftar role berhasil diambil',
    en: 'Roles retrieved successfully',
  },
  ROLE_UPDATED: { id: 'Role berhasil diperbarui', en: 'Role updated successfully' },
  ROLE_DELETED: { id: 'Role berhasil dihapus', en: 'Role deleted successfully' },
  ROLE_RESTORED: { id: 'Role berhasil dipulihkan', en: 'Role restored successfully' },
  ROLE_PERMISSIONS_RETRIEVED: {
    id: 'Daftar permission role berhasil diambil',
    en: 'The permissions of the role retrieved successfully',
  },
  ROLE_PERMISSION_MAPPED: {
    id: 'Permission berhasil ditambahkan ke role',
    en: 'Permission added to the role',
  },
  ROLE_PERMISSION_UNMAPPED: {
    id: 'Permission berhasil dicabut dari role',
    en: 'Permission removed from the role',
  },
  PERMISSION_CREATED: {
    id: 'Permission menu berhasil dibuat',
    en: 'Menu permission created successfully',
  },
  PERMISSION_RETRIEVED: {
    id: 'Permission berhasil diambil',
    en: 'Permission retrieved successfully',
  },
  PERMISSION_OPTIONS_RETRIEVED: {
    id: 'Daftar pilihan permission berhasil diambil',
    en: 'Permission options retrieved successfully',
  },
  PERMISSION_LIST_RETRIEVED: {
    id: 'Daftar permission berhasil diambil',
    en: 'Permissions retrieved successfully',
  },
  PERMISSION_UPDATED: {
    id: 'Permission menu berhasil diperbarui',
    en: 'Menu permission updated successfully',
  },
  PERMISSION_DELETED: {
    id: 'Permission menu berhasil dihapus',
    en: 'Menu permission deleted successfully',
  },
  PERMISSION_RESTORED: {
    id: 'Permission menu berhasil dipulihkan',
    en: 'Menu permission restored successfully',
  },
  ROLE_ALREADY_ASSIGNED: {
    id: 'Pengguna sudah memiliki role ini',
    en: 'The user already has this role',
  },
  PERMISSION_ALREADY_MAPPED: {
    id: 'Role sudah memiliki permission ini',
    en: 'The role already has this permission',
  },
  PERMISSION_ALREADY_GRANTED: {
    id: 'Pengguna sudah memiliki izin tambahan ini',
    en: 'The user already has this extra permission',
  },
  EXPIRY_IN_PAST: {
    id: 'Masa berlaku izin harus di masa depan',
    en: 'A permission must expire in the future',
  },
} as const satisfies Record<string, LocalizedMessage>;

export const rbacUserNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Pengguna dengan ID ${id} tidak ditemukan`,
  en: `User with ID ${id} not found`,
});

export const rbacRoleNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Role dengan ID ${id} tidak ditemukan`,
  en: `Role with ID ${id} not found`,
});

/** A live permission (retired or not) that is not there. */
export const rbacPermissionMissingMessage = (id: string): LocalizedMessage => ({
  id: `Permission dengan ID ${id} tidak ditemukan`,
  en: `Permission with ID ${id} not found`,
});

export const rbacPermissionNotFoundMessage = (id: string): LocalizedMessage => ({
  id: `Permission dengan ID ${id} tidak ditemukan atau sudah tidak berlaku`,
  en: `Permission with ID ${id} not found or retired`,
});

export const rbacRoleNotAssignedMessage = (userId: string, roleId: string): LocalizedMessage => ({
  id: `Pengguna ${userId} tidak memiliki role ${roleId}`,
  en: `User ${userId} does not have role ${roleId}`,
});

export const rbacPermissionNotMappedMessage = (
  roleId: string,
  permissionId: string,
): LocalizedMessage => ({
  id: `Role ${roleId} tidak memiliki permission ${permissionId}`,
  en: `Role ${roleId} does not have permission ${permissionId}`,
});

export const rbacPermissionNotGrantedMessage = (
  userId: string,
  permissionId: string,
): LocalizedMessage => ({
  id: `Pengguna ${userId} tidak memiliki izin tambahan ${permissionId}`,
  en: `User ${userId} does not have the extra permission ${permissionId}`,
});
