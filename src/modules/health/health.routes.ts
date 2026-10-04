import { Hono } from 'hono';
import { checkHealth, checkLiveness, checkReadiness } from './health.controller';

export const healthRoutes = new Hono();

healthRoutes.get('/', checkHealth);
healthRoutes.get('/liveness', checkLiveness);
healthRoutes.get('/readiness', checkReadiness);
