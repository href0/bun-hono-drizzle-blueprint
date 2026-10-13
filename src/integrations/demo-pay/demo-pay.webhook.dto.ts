import { z } from 'zod';

/**
 * Demo Pay webhook payload, exactly as the vendor sends it (camelCase keys — the vendor's
 * contract, validated with `bodyKeys: 'verbatim'`). Fields we do not use are kept
 * (`.passthrough()`): the vendor can add fields without breaking us, and the stored event
 * (`webhook_events.payload`) stays the whole event.
 */
export const demoPayWebhookPayloadSchema = z
  .object({
    /** The vendor's event id: the deduplication key (`webhook_events.event_id`). */
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(100),
    data: z
      .object({
        paymentId: z.string().min(1).max(100),
        status: z.enum(['pending', 'succeeded', 'failed']),
        amount: z.number().int().nonnegative(),
        currency: z.string().length(3),
      })
      .passthrough(),
  })
  .passthrough();

export type DemoPayWebhookPayload = z.infer<typeof demoPayWebhookPayloadSchema>;
