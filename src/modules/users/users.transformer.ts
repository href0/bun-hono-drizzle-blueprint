import type { User } from '../../database/schema';

export interface UserResponse {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const toUserResponse = (user: User): UserResponse => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const toUserListResponse = (userList: User[]): UserResponse[] => {
  return userList.map(toUserResponse);
};
