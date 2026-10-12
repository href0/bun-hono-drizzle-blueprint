import { describe, expect, it } from 'bun:test';
import { createSqlRecorder } from '../../../test/helpers/sql-recorder';
import type { NewWebhookEvent } from '../../database/schema';
import type { PaymentNotificationDto } from './payment-notifications.dto';
import type { PaymentNotificationsRepository } from './payment-notifications.repository';
import { PaymentNotificationsService } from './payment-notifications.service';

const notification: PaymentNotificationDto = {
  id: 'evt_1',
  type: 'payment.succeeded',
  data: { paymentId: 'pay_1', status: 'succeeded', amount: 150000, currency: 'IDR' },
};

/** A repository fake that remembers received events, like the unique index would. */
const inbox = () => {
  const stored = new Map<string, NewWebhookEvent>();
  const repo = {
    appendIfNew: async (event: NewWebhookEvent) => {
      const key = `${event.vendor}:${event.eventId}`;
      if (stored.has(key)) return null;
      stored.set(key, event);
      return event;
    },
  } as unknown as PaymentNotificationsRepository;
  return { repo, stored };
};

describe('PaymentNotificationsService (Unit)', () => {
  const recorder = createSqlRecorder();

  it('stores a new event with its vendor id, type and payload', async () => {
    const { repo, stored } = inbox();
    const service = new PaymentNotificationsService(repo);

    const receipt = await recorder.txHost.run(() => service.receive('demo-pay', notification));

    expect(receipt).toEqual({ received: true, duplicate: false });
    expect([...stored.values()]).toEqual([
      {
        vendor: 'demo-pay',
        eventId: 'evt_1',
        eventType: 'payment.succeeded',
        payload: notification,
      },
    ]);
  });

  it('acknowledges a vendor retry of the same event without processing it again', async () => {
    const { repo, stored } = inbox();
    const service = new PaymentNotificationsService(repo);

    await recorder.txHost.run(() => service.receive('demo-pay', notification));
    const retry = await recorder.txHost.run(() => service.receive('demo-pay', notification));

    expect(retry).toEqual({ received: true, duplicate: true });
    expect(stored.size).toBe(1);
  });

  it('treats the same event id from another vendor as a different event', async () => {
    const { repo, stored } = inbox();
    const service = new PaymentNotificationsService(repo);

    await recorder.txHost.run(() => service.receive('demo-pay', notification));
    const other = await recorder.txHost.run(() => service.receive('other-pay', notification));

    expect(other.duplicate).toBe(false);
    expect(stored.size).toBe(2);
  });
});
