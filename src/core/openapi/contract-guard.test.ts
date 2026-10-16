import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { runWithRequestContext } from '../context/request-context';
import { APP_ERROR_CODES, ConflictError, NotFoundError } from '../errors';
import { I18N_MESSAGES } from '../i18n/messages';
import { asyncHandler, globalErrorHandler, requestContextMiddleware } from '../middlewares';
import { ApiResponse } from '../response';
import { CONTRACT_CHECKS, errorViolation, successViolation } from './contract-guard';
import { describeEndpoint } from './describe-endpoint';

const CREATED = { id: 'Dibuat', en: 'Created' };
const UPDATED = { id: 'Diperbarui', en: 'Updated' };

/** A route documenting 201 CREATED (+ 200 UPDATED) and 404, answering whatever the test asks. */
const appAnswering = (answer: () => ApiResponse | never): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.post(
    '/things',
    describeEndpoint({
      tags: ['Probe'],
      summary: 'Save a thing',
      response: { status: 201, description: 'Created', message: CREATED, data: z.null() },
      alsoResponds: [{ status: 200, description: 'Updated', message: UPDATED }],
      errors: [404],
    }),
    asyncHandler(() => Promise.resolve(answer())),
  );
  app.onError(globalErrorHandler);
  return app;
};

const statusOf = async (answer: () => ApiResponse | never): Promise<number> =>
  (await appAnswering(answer).request('/things', { method: 'POST' })).status;

describe('contract guard (NODE_ENV=test)', () => {
  it('is on in tests', () => {
    expect(CONTRACT_CHECKS).toBe(true);
  });

  it('passes responses that match the documented contract', async () => {
    expect(await statusOf(() => new ApiResponse(null, CREATED, 201))).toBe(201);
    expect(await statusOf(() => new ApiResponse(null, UPDATED, 200))).toBe(200);
    expect(
      await statusOf(() => {
        throw new NotFoundError();
      }),
    ).toBe(404);
  });

  it('turns an undocumented status, message or error code into a 500', async () => {
    expect(await statusOf(() => new ApiResponse(null, CREATED, 200))).toBe(500);
    expect(await statusOf(() => new ApiResponse(null, I18N_MESSAGES.SUCCESS, 201))).toBe(500);
    expect(await statusOf(() => new ApiResponse(null, 'plain text', 201))).toBe(500);
    expect(
      await statusOf(() => {
        throw new ConflictError();
      }),
    ).toBe(500);
  });

  it('explains each violation', () => {
    const contract = {
      summary: 'Save a thing',
      successMessages: new Map([[201, [CREATED]]]),
      errorCodes: new Map([[404, new Set<string>([APP_ERROR_CODES.NOT_FOUND])]]),
    };
    const context = {
      requestId: 'r',
      locale: 'en' as const,
      clientIp: 'unknown',
      actor: 'anonymous' as const,
      contract,
    };
    runWithRequestContext(context, () => {
      expect(successViolation(200, CREATED)).toBe('"Save a thing" answered 200, documented 201');
      expect(successViolation(201, UPDATED)).toContain(
        'other than its documented response.message',
      );
      expect(errorViolation(409, APP_ERROR_CODES.CONFLICT, 'CONFLICT')).toContain(
        'sent 409 ERR_CONFLICT, not documented',
      );
      // Platform codes are documented by their own middlewares: allowed on any route.
      expect(errorViolation(401, APP_ERROR_CODES.UNAUTHORIZED, 'UNAUTHORIZED')).toBeUndefined();
      // A code sent with another status or type than the catalog says is always wrong.
      expect(errorViolation(400, APP_ERROR_CODES.NOT_FOUND, 'NOT_FOUND')).toContain(
        'ERROR_CATALOG says 404',
      );
    });
    // Outside a request (no contract recorded) only the catalog is checked.
    expect(successViolation(299, CREATED)).toBeUndefined();
    expect(errorViolation(409, APP_ERROR_CODES.CONFLICT, 'CONFLICT')).toBeUndefined();
  });
});
