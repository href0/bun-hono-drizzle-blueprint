import { z } from 'zod';
import { envSource } from './env-source';
import { parseEnv, type EnvSource } from './parse-env';

/**
 * Example webhook vendor (`src/integrations/demo-pay/`): `DEMO_PAY_*`. An empty secret is not an
 * error — every Demo Pay webhook is then rejected (fail-closed), so the example never opens an
 * unauthenticated endpoint in a project that does not use it.
 */
const demoPaySchema = z.object({
  /** The signing secret the vendor shows in its dashboard. Empty = webhooks disabled (all 401). */
  DEMO_PAY_WEBHOOK_SECRET: z.string().default(''),
  /** How old a signed timestamp may be (either way) before the webhook is refused as a replay. */
  DEMO_PAY_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
});

export type DemoPayConfig = z.infer<typeof demoPaySchema>;

export const buildDemoPayConfig = (source: EnvSource): DemoPayConfig =>
  parseEnv('demo-pay', demoPaySchema, source);

export const demoPayConfig = buildDemoPayConfig(envSource);
