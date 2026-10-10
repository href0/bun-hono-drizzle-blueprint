import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { usersService, UsersService } from './users.service';
import { toUserResponse, toUserListResponse } from './users.transformer';
import type { PaginationQueryDto, UuidParamDto } from '../../core/dto/common.dto';
import type { CreateUserDto, UpdateUserDto } from './users.dto';
import { USER_MESSAGES } from './users.messages';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, USER_MESSAGES.CREATED, 201);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const user = await this.service.getUserById(param.id);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, USER_MESSAGES.RETRIEVED, 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PaginationQueryDto>(c);
    const { users, total } = await this.service.listUsers(query);
    const responseData = toUserListResponse(users);

    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(responseData, USER_MESSAGES.LIST_RETRIEVED, 200, {
      currentPage: query.page,
      perPage: query.perPage,
      totalItems: total,
      totalPages,
    });
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<UpdateUserDto>(c);
    const user = await this.service.updateUser(param.id, dto);

    return new ApiResponse(toUserResponse(user), USER_MESSAGES.UPDATED, 200);
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteUser(param.id);

    return new ApiResponse(null, USER_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const user = await this.service.restoreUser(param.id);

    return new ApiResponse(toUserResponse(user), USER_MESSAGES.RESTORED, 200);
  });

  getExternalPosts = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const posts = await this.service.getUserExternalPosts(param.id);

    return new ApiResponse(posts, USER_MESSAGES.EXTERNAL_POSTS_RETRIEVED, 200);
  });
}

export const usersController = new UsersController();
