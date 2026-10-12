import { z } from 'zod';
import {
  demoPayWebhookPayloadSchema,
  type DemoPayWebhookPayload,
} from '../../integrations/demo-pay';

/** The Demo Pay payload, validated as the vendor sends it (`bodyKeys: 'verbatim'`). */
export const paymentNotificationSchema = demoPayWebhookPayloadSchema;

export type PaymentNotificationDto = DemoPayWebhookPayload;

/** What the vendor gets back: 2xx is all it needs; `duplicate` marks an event seen before. */
export const webhookReceiptSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean(),
});

export type WebhookReceipt = z.infer<typeof webhookReceiptSchema>;
