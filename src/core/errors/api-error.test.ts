import { describe, expect, it } from 'bun:test';
import {
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
} from './index';

describe('ApiError Hierarchy (Unit)', () => {
  it('should initialize BadRequestError with default and custom values', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.errorType).toBe('BAD_REQUEST');
    expect(err.errorCode).toBe('ERR_BAD_REQUEST');
    expect(err.origin).toBe('APP');
  });

  it('should initialize ValidationError with default and custom values', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(400);
    expect(err.errorType).toBe('VALIDATION_ERROR');
    expect(err.errorCode).toBe('ERR_INVALID_INPUT');
    expect(err.origin).toBe('APP');
  });

  it('should initialize UnauthorizedError', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.errorType).toBe('UNAUTHORIZED');
  });

  it('should initialize ForbiddenError', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.errorType).toBe('FORBIDDEN');
  });

  it('should initialize NotFoundError', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.errorType).toBe('NOT_FOUND');
  });

  it('should initialize ConflictError', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.errorType).toBe('CONFLICT');
  });

  it('should initialize ExternalServiceError with custom origin and status', () => {
    const err = new ExternalServiceError(
      'Gateway timeout',
      [{ message: 'Timeout' }],
      'PAYMENT_GATEWAY',
      504,
    );
    expect(err.statusCode).toBe(504);
    expect(err.origin).toBe('PAYMENT_GATEWAY');
    expect(err.errorCode).toBe('ERR_EXT_PAYMENT_GATEWAY');
  });
});
