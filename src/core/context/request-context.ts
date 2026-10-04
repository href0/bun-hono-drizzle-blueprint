import { AsyncLocalStorage } from 'node:async_hooks';
import { appConfig, type Locale } from '../../config';

/** Who performs the current operation; persisted in audit columns and logs. */
export type Actor = `user:${string}` | `partner:${string}` | 'system' | 'anonymous';

export interface RequestContext {
  readonly requestId: string;
  readonly locale: Locale;
  /** Trusted client address (`TRUST_PROXY_HOPS`), or `unknown`; the rate-limit key. */
  readonly clientIp: string;
  actor: Actor;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Per-request context (replacement for NestJS CLS). Services read it instead of receiving the
 * Hono `Context`, which keeps them HTTP-agnostic. Outside a request (bootstrap, jobs) it is absent.
 */
export const getRequestContext = (): RequestContext | undefined => storage.getStore();

/** Current actor; `system` outside a request (bootstrap, scheduled jobs). */
export const getActor = (): Actor => storage.getStore()?.actor ?? 'system';

/** Language of user-facing messages; `DEFAULT_LOCALE` outside a request. */
export const getLocale = (): Locale => storage.getStore()?.locale ?? appConfig.DEFAULT_LOCALE;

/** Trusted client IP of the current request; `undefined` outside a request. */
export const getClientIp = (): string | undefined => storage.getStore()?.clientIp;

export const runWithRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

/**
 * Records the authenticated caller for the rest of the request.
 * Throws outside a request: an actor set there would silently be lost.
 */
export const setActor = (actor: Actor): void => {
  const context = storage.getStore();
  if (!context) {
    throw new Error('setActor() called outside of a request context');
  }
  context.actor = actor;
};
