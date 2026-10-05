import { describe, expect, it } from 'bun:test';
import { DB_PING_TIMEOUT_MS, pingDatabase, type PingClient } from './health-probe';

const client =
  (behaviour: () => Promise<unknown>): PingClient =>
  () =>
    behaviour();

describe('pingDatabase()', () => {
  it('should return true when query executes successfully', async () => {
    expect(
      await pingDatabase(
        1000,
        client(async () => [{ '?column?': 1 }]),
      ),
    ).toBe(true);
  });

  it('should return false when query throws an error', async () => {
    const refused = client(() => Promise.reject(new Error('Connection refused')));
    expect(await pingDatabase(1000, refused)).toBe(false);
  });

  it('should return false once the timeout elapses when the database never answers', async () => {
    const started = performance.now();

    expect(
      await pingDatabase(
        30,
        client(() => new Promise(() => undefined)),
      ),
    ).toBe(false);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('should use the real client by default (a closed port under the hermetic test env)', async () => {
    expect(await pingDatabase()).toBe(false);
  });

  it('should default to a timeout shorter than typical probe timeouts', () => {
    expect(DB_PING_TIMEOUT_MS).toBe(2000);
  });
});
