import type { LocalizedMessage } from '../../core/i18n';

export const RBAC_MESSAGES = {
  SUPER_ADMIN_FIXED: {
    id: 'Role super admin memiliki semua permission dan pemetaannya tidak dapat diubah',
    en: 'The super admin role holds every permission; its mapping cannot be changed',
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
