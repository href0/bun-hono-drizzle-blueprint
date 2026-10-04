import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { usersService, UsersService } from './users.service';
import { toUserResponse, toUserListResponse } from './users.transformer';
import type { CreateUserDto, UserIdParamDto, UserQueryDto } from './users.dto';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreateUserDto>(c);
    const user = await this.service.createUser(dto);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, 'User created successfully', 201);
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UserIdParamDto>(c);
    const user = await this.service.getUserById(param.id);
    const responseData = toUserResponse(user);

    return new ApiResponse(responseData, 'User retrieved successfully', 200);
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<UserQueryDto>(c);
    const { users, total } = await this.service.listUsers(query);
    const responseData = toUserListResponse(users);

    const totalPages = Math.ceil(total / query.limit) || 1;

    return new ApiResponse(responseData, 'Users retrieved successfully', 200, {
      currentPage: query.page,
      perPage: query.limit,
      totalItems: total,
      totalPages,
    });
  });

  getExternalPosts = asyncHandler(async (c) => {
    const param = getValidatedParams<UserIdParamDto>(c);
    const posts = await this.service.getUserExternalPosts(param.id);

    return new ApiResponse(posts, 'User external posts retrieved successfully', 200);
  });
}

export const usersController = new UsersController();
