import { Hono } from 'hono';
import { describeEndpoint } from '../../core/openapi';
import { healthController } from './health.controller';
import { healthReportSchema, livenessSchema } from './health.dto';
import { HEALTH_MESSAGES } from './health.messages';

/** Unversioned, mounted at `<API_BASE_PATH>/health`; public and exempt from the global rate limit. */
export const healthRoutes = new Hono();

const tags = ['Health'];

healthRoutes.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'Service health: UP, DEGRADED (Redis down) or DOWN (database down)',
    description:
      'Always 200 so monitors can read the status; use /readiness for traffic decisions.',
    response: {
      status: 200,
      description: 'Health report',
      message: [HEALTH_MESSAGES.UP, HEALTH_MESSAGES.DEGRADED, HEALTH_MESSAGES.DOWN],
      data: healthReportSchema,
    },
  }),
  healthController.health,
);
healthRoutes.get(
  '/readiness',
  describeEndpoint({
    tags,
    summary: 'Readiness probe: 503 only when the database is down',
    response: {
      status: 200,
      description: 'Ready to serve traffic',
      message: HEALTH_MESSAGES.READY,
      data: healthReportSchema,
    },
    errors: [503],
  }),
  healthController.readiness,
);
healthRoutes.get(
  '/liveness',
  describeEndpoint({
    tags,
    summary: 'Liveness probe: the process answers (no dependency checks)',
    response: {
      status: 200,
      description: 'Process alive',
      message: HEALTH_MESSAGES.ALIVE,
      data: livenessSchema,
    },
  }),
  healthController.liveness,
);
