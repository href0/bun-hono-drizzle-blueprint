import { z } from 'zod';
import { isoDateTimeString } from '../../core/openapi';

const componentStatusSchema = z.enum(['UP', 'DOWN']);

/** `DEGRADED`: serving, but a fail-open dependency (Redis) is down — alert, don't restart. */
export const healthStateSchema = z.enum(['UP', 'DEGRADED', 'DOWN']);

export const healthReportSchema = z.object({
  status: healthStateSchema,
  components: z.object({
    database: componentStatusSchema,
    redis: componentStatusSchema,
  }),
  timestamp: isoDateTimeString(),
});

export const livenessSchema = z.object({
  status: z.literal('UP'),
  uptimeSeconds: z.number().int(),
  timestamp: isoDateTimeString(),
});

export type HealthState = z.infer<typeof healthStateSchema>;
export type HealthReport = z.infer<typeof healthReportSchema>;
