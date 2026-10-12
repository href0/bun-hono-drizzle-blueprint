import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { authorize } from './helpers/authorized-app';
import { appConfig } from '../src/config';

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
    expect(body.message).toBe('Layanan aktif');
    expect(body.data.name).toBe(appConfig.APP_NAME);
    expect(body.data.version).toBe('1.0.0');
  });

  const health = `${appConfig.API_BASE_PATH}/health`;

  it('GET <base>/health answers 200 with UP / DEGRADED / DOWN and component details', async () => {
    const res = await app.request(health);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: { status: string; components: { database: string; redis: string }; timestamp: string };
    };
    expect(body.success).toBe(true);
    expect(['UP', 'DEGRADED', 'DOWN']).toContain(body.data.status);
    expect(['UP', 'DOWN']).toContain(body.data.components.database);
    // Tests never connect Redis (lazy client), so the cache is always reported DOWN here.
    expect(body.data.components.redis).toBe('DOWN');
  });

  it('GET <base>/health/liveness answers 200 without touching dependencies', async () => {
    const res = await app.request(`${health}/liveness`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { status: string; uptime_seconds: number } };
    expect(body.data.status).toBe('UP');
    expect(typeof body.data.uptime_seconds).toBe('number');
  });

  it('GET <base>/health/readiness answers 200 or the 503 error envelope (database-dependent)', async () => {
    const res = await app.request(`${health}/readiness`);
    expect([200, 503]).toContain(res.status);
  });

  it('health is unversioned: the old /api/v1/health path is gone', async () => {
    expect(appConfig.API_BASE_PATH).toBe('/api');
    // Default-deny answers anonymous callers before routing; authenticated ones get 404.
    expect((await app.request('/api/v1/health')).status).toBe(401);
    expect((await (await authorize(createApp())).request('/api/v1/health')).status).toBe(404);
    expect((await app.request('/api/health/liveness')).status).toBe(200);
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
    expect(body.message).toBe('Terjadi kesalahan pada server');
    expect(body.error.type).toBe('INTERNAL_SERVER_ERROR');
  });
});
