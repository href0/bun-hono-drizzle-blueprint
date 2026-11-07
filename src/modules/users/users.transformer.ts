import type { UserResponse, UserWithRoles } from './users.dto';

export const toUserResponse = (user: UserWithRoles): UserResponse => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  roles: [...user.roles],
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const toUserListResponse = (userList: UserWithRoles[]): UserResponse[] => {
  return userList.map(toUserResponse);
};
