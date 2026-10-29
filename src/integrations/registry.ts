import type { IntegrationIdentity } from '../core/errors';

/**
 * Every external system this application calls. The key is the integration code sent as
 * `error.origin`; `vendorName` is the readable name sent as `error.vendor_name` when the call
 * fails. One entry per vendor — `HttpClientService` requires one (`integration` option). A new
 * project starts without any (`bun run setup` removes the examples); the marker stays.
 */
export const INTEGRATION_REGISTRY = {
  // scaffold:registry — `bun run scaffold integration|webhook` adds vendors below; keep it.
  JSONPLACEHOLDER: { code: 'JSONPLACEHOLDER', vendorName: 'JSONPlaceholder' },
  /** Example webhook vendor (inbound only): `src/integrations/demo-pay/`. */
  DEMO_PAY: { code: 'DEMO_PAY', vendorName: 'Demo Pay (example)' },
} as const satisfies Record<string, IntegrationIdentity>;
