import type { IntegrationIdentity } from '../core/errors';

/**
 * Every external system this application calls. The key is the integration code sent as
 * `error.origin`; `institution` is the readable name sent as `error.institution` when the call
 * fails. One entry per vendor — `HttpClientService` requires one (`integration` option).
 */
export const INTEGRATION_REGISTRY = {
  JSONPLACEHOLDER: { code: 'JSONPLACEHOLDER', institution: 'JSONPlaceholder' },
  /** Example webhook vendor (inbound only): `src/integrations/demo-pay/`. */
  DEMO_PAY: { code: 'DEMO_PAY', institution: 'Demo Pay (example)' },
} as const satisfies Record<string, IntegrationIdentity>;
