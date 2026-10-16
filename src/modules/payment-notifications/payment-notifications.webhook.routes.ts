import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { paymentNotificationSchema, webhookReceiptSchema } from './payment-notifications.dto';
import { PAYMENT_NOTIFICATION_MESSAGES } from './payment-notifications.messages';
import { paymentNotificationsWebhookController } from './payment-notifications.webhook.controller';

/**
 * Mounted at `<API_BASE_PATH>/webhooks/demo-pay`, behind the vendor's `webhookAuth()` (outside
 * `/v1`: the vendor owns this contract). The payload keeps the vendor's own key casing.
 */
export const paymentNotificationWebhookRoutes = new Hono();

paymentNotificationWebhookRoutes.post(
  '/',
  describeEndpoint({
    tags: ['Webhooks'],
    summary: 'Demo Pay payment notification (vendor webhook, idempotent per event id)',
    response: {
      status: 200,
      description: 'Received (or already received)',
      message: [PAYMENT_NOTIFICATION_MESSAGES.RECEIVED, PAYMENT_NOTIFICATION_MESSAGES.DUPLICATE],
      data: webhookReceiptSchema,
    },
  }),
  validate({ body: paymentNotificationSchema, bodyKeys: 'verbatim' }),
  paymentNotificationsWebhookController.receive,
);
