import { sqlClient } from './connection';

/**
 * Pings the database using a low-overhead probe query.
 * Catches TCP or authentication failures gracefully and returns boolean health status.
 */
export const pingDatabase = async (): Promise<boolean> => {
  try {
    await sqlClient`SELECT 1;`;
    return true;
  } catch {
    return false;
  }
};
