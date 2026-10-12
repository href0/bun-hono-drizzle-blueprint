// Domain modules use the payload contract; the verifier (`demo-pay.webhook.ts`) is wired only in
// createApp() (dependency-cruiser `webhook-verifier-only-in-app`).
export * from './demo-pay.webhook.dto';
