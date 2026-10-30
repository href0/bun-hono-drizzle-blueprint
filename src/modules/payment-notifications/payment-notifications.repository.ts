import { AppendOnlyRepository, defaultTxHost, type TransactionHost } from '../../database';
import { webhookEvents, type NewWebhookEvent, type WebhookEvent } from '../../database/schema';

/** The webhook inbox (`webhook_events`) for the payment notifications this module receives. */
export class PaymentNotificationsRepository extends AppendOnlyRepository<typeof webhookEvents> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    super(webhookEvents, txHost);
  }

  /**
   * Stores the event unless `(vendor, event_id)` is already there: the stored row, or `null` for a
   * vendor retry of an event already received (D28). No error, so the transaction stays usable.
   */
  async appendIfNew(event: NewWebhookEvent): Promise<WebhookEvent | null> {
    const rows = await this.txHost.tx
      .insert(webhookEvents)
      .values(event)
      .onConflictDoNothing({ target: [webhookEvents.vendor, webhookEvents.eventId] })
      .returning();
    return rows.at(0) ?? null;
  }
}

export const paymentNotificationsRepository = new PaymentNotificationsRepository();
