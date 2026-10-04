import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { globalErrorHandler, requestContextMiddleware } from '../../core/middlewares';
import { HealthController } from './health.controller';
import { HealthService, type HealthProbes } from './health.service';

const buildApp = (database: boolean, redis: boolean): Hono => {
  const probes: HealthProbes = {
    pingDatabase: () => Promise.resolve(database),
    isCacheReady: () => redis,
  };
  const controller = new HealthController(new HealthService(probes));
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.get('/health', controller.health);
  app.get('/health/readiness', controller.readiness);
  app.get('/health/liveness', controller.liveness);
  app.onError(globalErrorHandler);
  return app;
};

interface Envelope {
  message: string;
  data: { status: string; components: { database: string; redis: string } };
  error?: { type: string; code: string; details: { field: string; message: string }[] };
}

const read = async (app: Hono, path: string): Promise<{ status: number; body: Envelope }> => {
  const res = await app.request(path, { headers: { 'Accept-Language': 'en' } });
  return { status: res.status, body: (await res.json()) as Envelope };
};

describe('HealthController', () => {
  it('health: always 200 with UP / DEGRADED / DOWN and a matching message', async () => {
    const cases = [
      [true, true, 'UP', 'Service is healthy'],
      [true, false, 'DEGRADED', 'Service is running in degraded mode'],
      [false, true, 'DOWN', 'Service is unhealthy'],
    ] as const;
    for (const [database, redis, state, message] of cases) {
      const { status, body } = await read(buildApp(database, redis), '/health');
      expect(status).toBe(200);
      expect(body.data.status).toBe(state);
      expect(body.message).toBe(message);
    }
  });

  it('readiness: 200 when the database is up, even with Redis down (fail-open)', async () => {
    const { status, body } = await read(buildApp(true, false), '/health/readiness');
    expect(status).toBe(200);
    expect(body.data.status).toBe('DEGRADED');
  });

  it('readiness: 503 SERVICE_UNAVAILABLE envelope naming the database when it is down', async () => {
    const { status, body } = await read(buildApp(false, true), '/health/readiness');
    expect(status).toBe(503);
    expect(body.error).toMatchObject({
      type: 'SERVICE_UNAVAILABLE',
      code: 'ERR_SERVICE_UNAVAILABLE',
      details: [{ field: 'database', message: 'Database is unavailable' }],
    });
  });

  it('liveness: 200 even when every dependency is down', async () => {
    const { status, body } = await read(buildApp(false, false), '/health/liveness');
    expect(status).toBe(200);
    expect(body.data.status).toBe('UP');
  });
});
