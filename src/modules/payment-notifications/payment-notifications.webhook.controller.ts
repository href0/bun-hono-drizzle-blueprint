import { asyncHandler, currentWebhook, getValidatedBody } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { PaymentNotificationDto } from './payment-notifications.dto';
import { PAYMENT_NOTIFICATION_MESSAGES } from './payment-notifications.messages';
import {
  paymentNotificationsService,
  PaymentNotificationsService,
} from './payment-notifications.service';

export class PaymentNotificationsWebhookController {
  constructor(
    private readonly service: PaymentNotificationsService = paymentNotificationsService,
  ) {}

  /** Always 200 for a verified, valid event — also for a retry — so the vendor stops resending. */
  receive = asyncHandler(async (c) => {
    const notification = getValidatedBody<PaymentNotificationDto>(c);
    const receipt = await this.service.receive(currentWebhook().vendor, notification);
    return new ApiResponse(
      receipt,
      receipt.duplicate
        ? PAYMENT_NOTIFICATION_MESSAGES.DUPLICATE
        : PAYMENT_NOTIFICATION_MESSAGES.RECEIVED,
      200,
    );
  });
}

export const paymentNotificationsWebhookController = new PaymentNotificationsWebhookController();
