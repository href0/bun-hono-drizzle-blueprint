import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { env } from '../src/config/env.config';

describe('Health Module', () => {
  const app = createApp();

  it('GET / should return 200 with standard success envelope', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      message: string;
      data: { name: string; environment: string; version: string };
    };
    expect(body.success).toBe(true);
    expect(body.status_code).toBe(200);
    expect(body.message).toBe('Service online');
    expect(body.data.name).toBe(env.APP_NAME);
    expect(body.data.version).toBe('1.0.0');
  });

  it('GET /api/v1/health should return 200 with standard success envelope in snake_case', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      message: string;
      data: { status: string; uptime: number };
    };

    expect(body.success).toBe(true);
    expect(body.status_code).toBe(200);
    expect(body.message).toBe('Service is healthy');
    expect(body.data.status).toBe('ok');
    expect(typeof body.data.uptime).toBe('number');
  });

  it('GET /api/v1/health/liveness should return 200 with process health info', async () => {
    const res = await app.request('/api/v1/health/liveness');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      data: { status: string };
    };
    expect(body.success).toBe(true);
    expect(body.status_code).toBe(200);
    expect(body.data.status).toBe('ok');
  });

  it('GET /api/v1/health/readiness should probe database and redis dependency status', async () => {
    const res = await app.request('/api/v1/health/readiness');
    // In test environment, returns 200 (if DB reachable or mocked) or 503 (if DB offline)
    expect([200, 503]).toContain(res.status);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      data: { status: string; database: string; redis: string };
    };
    expect(typeof body.data.status).toBe('string');
    expect(typeof body.data.database).toBe('string');
    expect(typeof body.data.redis).toBe('string');
  });

  it('GET /non-existent-route should return 404 with standard error envelope in snake_case', async () => {
    const res = await app.request('/non-existent-route');
    expect(res.status).toBe(404);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      error: { type: string; code: string };
    };

    expect(body.success).toBe(false);
    expect(body.status_code).toBe(404);
    expect(body.error.type).toBe('NOT_FOUND');
    expect(body.error.code).toBe('ERR_ROUTE_NOT_FOUND');
  });

  it('should handle unhandled errors with 500 internal server error envelope in snake_case', async () => {
    const errorApp = createApp();
    errorApp.get('/error-test', () => {
      throw new Error('Unexpected crash');
    });

    const res = await errorApp.request('/error-test');
    expect(res.status).toBe(500);

    const body = (await res.json()) as {
      success: boolean;
      status_code: number;
      message: string;
      error: { type: string };
    };
    expect(body.success).toBe(false);
    expect(body.status_code).toBe(500);
    expect(body.message).toBe('Internal Server Error');
    expect(body.error.type).toBe('INTERNAL_SERVER_ERROR');
  });
});
