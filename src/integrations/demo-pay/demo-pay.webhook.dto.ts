import { z } from 'zod';

/**
 * Demo Pay webhook payload, exactly as the vendor sends it (camelCase keys — the vendor's
 * contract, validated with `bodyKeys: 'verbatim'`). Unknown fields are ignored so the vendor can
 * add fields without breaking us.
 */
export const demoPayWebhookPayloadSchema = z.object({
  /** The vendor's event id: the deduplication key (`webhook_events.event_id`). */
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z.object({
    paymentId: z.string().min(1).max(100),
    status: z.enum(['pending', 'succeeded', 'failed']),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
});

export type DemoPayWebhookPayload = z.infer<typeof demoPayWebhookPayloadSchema>;
