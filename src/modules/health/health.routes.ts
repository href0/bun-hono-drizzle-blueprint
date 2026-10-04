import { Hono } from 'hono';
import { checkLiveness, checkReadiness } from './health.controller';

export const healthRoutes = new Hono();

healthRoutes.get('/', checkLiveness);
healthRoutes.get('/liveness', checkLiveness);
healthRoutes.get('/readiness', checkReadiness);
