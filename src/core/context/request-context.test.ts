import { describe, expect, it } from 'bun:test';
import { getActor, getRequestContext, runWithRequestContext, setActor } from './request-context';

const tick = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('RequestContext (Unit)', () => {
  it('should be absent outside a request, with `system` as the actor', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getActor()).toBe('system');
  });

  it('should expose the context and let the actor be updated for the rest of the request', async () => {
    await runWithRequestContext(
      { requestId: 'req-1', locale: 'id', actor: 'anonymous' },
      async () => {
        expect(getActor()).toBe('anonymous');
        setActor('user:42');
        await tick(1);
        expect(getRequestContext()).toEqual({ requestId: 'req-1', locale: 'id', actor: 'user:42' });
      },
    );

    expect(getRequestContext()).toBeUndefined();
  });

  it('should refuse to set an actor outside a request', () => {
    expect(() => {
      setActor('user:1');
    }).toThrow('outside of a request context');
  });

  it('should isolate concurrent requests', async () => {
    const handle = (id: string, delay: number): Promise<string | undefined> =>
      runWithRequestContext({ requestId: id, locale: 'id', actor: 'anonymous' }, async () => {
        setActor(`user:${id}`);
        await tick(delay);
        return `${getRequestContext()?.requestId ?? '-'}/${getActor()}`;
      });

    const results = await Promise.all([handle('a', 15), handle('b', 1), handle('c', 8)]);

    expect(results).toEqual(['a/user:a', 'b/user:b', 'c/user:c']);
  });
});
