import { ServiceUnavailableError } from '../../core/errors';
import { asyncHandler } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { HEALTH_MESSAGES } from './health.messages';
import { healthService, HealthService } from './health.service';

export class HealthController {
  constructor(private readonly service: HealthService = healthService) {}

  /** Status page for humans and monitors: always 200, `status` says UP / DEGRADED / DOWN. */
  health = asyncHandler(async () => {
    const report = await this.service.check();
    return new ApiResponse(report, HEALTH_MESSAGES[report.status], 200);
  });

  /** Load balancer / k8s readiness: 503 only when the required database is down. */
  readiness = asyncHandler(async () => {
    const report = await this.service.check();
    if (report.components.database === 'DOWN') {
      throw new ServiceUnavailableError(HEALTH_MESSAGES.NOT_READY, {
        details: [{ field: 'database', message: HEALTH_MESSAGES.DATABASE_UNAVAILABLE }],
      });
    }
    return new ApiResponse(report, HEALTH_MESSAGES.READY, 200);
  });

  /** k8s liveness: the process answers — no dependency checks, so a DB outage never restarts pods. */
  liveness = asyncHandler(() =>
    Promise.resolve(
      new ApiResponse(
        {
          status: 'UP',
          uptimeSeconds: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
        },
        HEALTH_MESSAGES.ALIVE,
        200,
      ),
    ),
  );
}

export const healthController = new HealthController();
