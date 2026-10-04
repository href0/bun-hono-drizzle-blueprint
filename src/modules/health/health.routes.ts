import { Hono } from 'hono';
import { healthController } from './health.controller';

/** Unversioned, mounted at `<API_BASE_PATH>/health`; public and exempt from the global rate limit. */
export const healthRoutes = new Hono();

healthRoutes.get('/', healthController.health);
healthRoutes.get('/readiness', healthController.readiness);
healthRoutes.get('/liveness', healthController.liveness);
