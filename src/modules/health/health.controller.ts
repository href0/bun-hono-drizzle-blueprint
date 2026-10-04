import { ApiResponse } from '../../core/response';
import { asyncHandler } from '../../core/middlewares';
import { checkReadinessStatus } from './health.service';

export const checkLiveness = asyncHandler(() => {
  return Promise.resolve(
    new ApiResponse(
      {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      'Service is healthy',
      200,
    ),
  );
});

export const checkHealth = checkLiveness;

export const checkReadiness = asyncHandler(async () => {
  const healthStatus = await checkReadinessStatus();
  const isHealthy = healthStatus.status === 'ready';

  return new ApiResponse(
    healthStatus,
    isHealthy ? 'Service is ready' : 'Service database unavailable',
    isHealthy ? 200 : 503,
  );
});
