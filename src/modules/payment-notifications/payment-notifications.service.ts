import { logger } from '../../core/logger';
import { Transactional } from '../../database/transactional.decorator';
import type { PaymentNotificationDto, WebhookReceipt } from './payment-notifications.dto';
import {
  PaymentNotificationsRepository,
  paymentNotificationsRepository,
} from './payment-notifications.repository';

/**
 * Receives payment notifications from a payment vendor's webhook (example: Demo Pay). The event is
 * stored and processed in one transaction: a failure leaves no row, so the vendor's retry is
 * processed again; a retry of a processed event is acknowledged without doing anything twice.
 */
export class PaymentNotificationsService {
  constructor(
    private readonly repo: PaymentNotificationsRepository = paymentNotificationsRepository,
  ) {}

  @Transactional()
  async receive(vendor: string, notification: PaymentNotificationDto): Promise<WebhookReceipt> {
    const stored = await this.repo.appendIfNew({
      vendor,
      eventId: notification.id,
      eventType: notification.type,
      payload: notification,
    });
    if (!stored) return { received: true, duplicate: true };

    // Domain processing goes here, in the same transaction (e.g. mark the order paid through this
    // module's repositories). The example only records that it happened.
    logger.info(
      {
        vendor,
        eventId: notification.id,
        paymentId: notification.data.paymentId,
        status: notification.data.status,
      },
      'Payment notification processed',
    );
    return { received: true, duplicate: false };
  }
}

export const paymentNotificationsService = new PaymentNotificationsService();
