import type { Context, Handler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiResponse } from '../response/api-response';

export type PureHandler<T = unknown> = (c: Context) => Promise<ApiResponse<T>>;

export const asyncHandler = <T>(handler: PureHandler<T>): Handler => {
  return async (c: Context) => {
    const result = await handler(c);
    if (result instanceof ApiResponse) {
      return c.json(result.toJSON(), result.statusCode as ContentfulStatusCode);
    }
    return result;
  };
};
