import { AsyncLocalStorage } from 'node:async_hooks';
import { appConfig, type Locale } from '../../config';
import type { Role } from '../security/roles';

/** Who performs the current operation; persisted in audit columns and logs. */
export type Actor =
  `user:${string}` | `partner:${string}` | `webhook:${string}` | 'system' | 'anonymous';

/** The caller proven by a verified access token. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
}

/** The partner proven by a valid signed request (`partnerAuth()`). */
export interface AuthenticatedPartner {
  readonly code: string;
}

/** The vendor whose webhook signature was verified (`webhookAuth()`). */
export interface AuthenticatedWebhook {
  readonly vendor: string;
}

export interface RequestContext {
  readonly requestId: string;
  readonly locale: Locale;
  /** Trusted client address (`TRUST_PROXY_HOPS`), or `unknown`; the rate-limit key. */
  readonly clientIp: string;
  actor: Actor;
  /** Set by `authenticate()`; absent for anonymous requests and public routes. */
  user?: AuthenticatedUser;
  /** Set by `partnerAuth()` on partner routes. */
  partner?: AuthenticatedPartner;
  /** Set by `webhookAuth()` on vendor webhook routes. */
  webhook?: AuthenticatedWebhook;
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

/** The authenticated caller of the current request, if any. */
export const getAuthenticatedUser = (): AuthenticatedUser | undefined => storage.getStore()?.user;

/** Trusted client IP of the current request; `undefined` outside a request. */
export const getAuthenticatedPartner = (): AuthenticatedPartner | undefined =>
  storage.getStore()?.partner;

export const getAuthenticatedWebhook = (): AuthenticatedWebhook | undefined =>
  storage.getStore()?.webhook;

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

/**
 * Records the user proven by an access token: the actor becomes `user:<id>` (audit columns, logs)
 * and the role is kept for authorization. Throws outside a request, like `setActor`.
 */
export const setAuthenticatedUser = (user: AuthenticatedUser): void => {
  setActor(`user:${user.id}`);
  const context = storage.getStore();
  if (context) context.user = user;
};

/**
 * Records the partner proven by a signed request: the actor becomes `partner:<code>` (audit
 * columns, logs). Throws outside a request, like `setActor`.
 */
export const setAuthenticatedPartner = (partner: AuthenticatedPartner): void => {
  setActor(`partner:${partner.code}`);
  const context = storage.getStore();
  if (context) context.partner = partner;
};

/**
 * Records the vendor proven by a verified webhook signature: the actor becomes `webhook:<vendor>`
 * (audit columns, logs). Throws outside a request, like `setActor`.
 */
export const setAuthenticatedWebhook = (webhook: AuthenticatedWebhook): void => {
  setActor(`webhook:${webhook.vendor}`);
  const context = storage.getStore();
  if (context) context.webhook = webhook;
};
