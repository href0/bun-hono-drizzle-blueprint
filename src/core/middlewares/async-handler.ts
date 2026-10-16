import type { Context, Handler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { InternalServerError } from '../errors/internal-server.error';
import { CONTRACT_CHECKS, reportViolation, successViolation } from '../openapi/contract-guard';
import { ApiResponse } from '../response/api-response';

export type PureHandler<T = unknown> = (c: Context) => Promise<ApiResponse<T>>;

export const asyncHandler = <T>(handler: PureHandler<T>): Handler => {
  return async (c: Context) => {
    const result = await handler(c);
    if (result instanceof ApiResponse) {
      // NODE_ENV=test: the status and message must be the ones the route documents.
      const violation = CONTRACT_CHECKS
        ? successViolation(result.statusCode, result.message)
        : undefined;
      if (violation !== undefined) {
        reportViolation(violation);
        throw new InternalServerError(violation);
      }
      return c.json(result.toJSON(), result.statusCode as ContentfulStatusCode);
    }
    return result;
  };
};
