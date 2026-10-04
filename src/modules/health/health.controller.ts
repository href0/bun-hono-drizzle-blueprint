import { ApiResponse } from '../../core/response';
import { asyncHandler } from '../../core/middlewares';
import { HEALTH_MESSAGES } from './health.messages';
import { checkReadinessStatus } from './health.service';

export const checkLiveness = asyncHandler(() => {
  return Promise.resolve(
    new ApiResponse(
      {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      HEALTH_MESSAGES.HEALTHY,
      200,
    ),
  );
});

export const checkReadiness = asyncHandler(async () => {
  const healthStatus = await checkReadinessStatus();
  const isHealthy = healthStatus.status === 'ready';

  return new ApiResponse(
    healthStatus,
    isHealthy ? HEALTH_MESSAGES.READY : HEALTH_MESSAGES.DATABASE_UNAVAILABLE,
    isHealthy ? 200 : 503,
  );
});
