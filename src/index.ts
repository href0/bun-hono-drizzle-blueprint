import type { Server } from 'bun';
import { createApp } from './app';
import { appConfig, redisConfig } from './config';
import { logger } from './core/logger';
import { sqlClient } from './database/connection';
import { closeRedisClient, redisClient } from './core/cache/redis.client';

export async function bootstrap(): Promise<Server<unknown>> {
  logger.info({ env: appConfig.NODE_ENV }, 'Starting bootstrap pre-flight verification...');

  // 1. Verify PostgreSQL Database Connection
  try {
    logger.info('Verifying PostgreSQL database connection...');
    await sqlClient`SELECT 1;`;
    logger.info('PostgreSQL database connection established successfully');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.fatal(
      { err: errorMsg },
      'FATAL: PostgreSQL database connection failed during startup. Server startup aborted.',
    );
    process.exit(1);
  }

  // 2. Verify Redis Connection (Fail-Open Resilience)
  try {
    logger.info('Verifying Redis connection...');
    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect();
    }
    await redisClient.ping();
    logger.info('Redis connection established successfully');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err: errorMsg, host: redisConfig.REDIS_HOST, port: redisConfig.REDIS_PORT },
      'WARNING: Redis connection unavailable on startup. Operating in degraded fail-open mode.',
    );
  }

  // 3. Start Hono HTTP Server
  const app = createApp();

  const server = Bun.serve({
    port: appConfig.PORT,
    fetch: app.fetch,
  });

  logger.info(
    {
      port: appConfig.PORT,
      env: appConfig.NODE_ENV,
      basePath: appConfig.API_BASE_PATH,
    },
    `${appConfig.APP_NAME} server started successfully on port ${appConfig.PORT}`,
  );

  // 4. Graceful Shutdown Hooks
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Termination signal received. Shutting down server gracefully...');
    await server.stop(true);

    try {
      await Promise.all([sqlClient.end({ timeout: 5 }), closeRedisClient(redisClient)]);
      logger.info('Database pool and Redis connections closed cleanly');
    } catch (shutdownErr: unknown) {
      logger.error({ err: shutdownErr }, 'Error during resource teardown');
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  return server;
}

if (import.meta.main) {
  void bootstrap();
}
