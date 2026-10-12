import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { webhookEvents, type WebhookEvent } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';
import { PaymentNotificationsRepository } from './payment-notifications.repository';

const event: WebhookEvent = {
  id: 7,
  vendor: 'demo-pay',
  eventId: 'evt_1',
  eventType: 'payment.succeeded',
  payload: { id: 'evt_1' },
  createdAt: Temporal.Instant.from('2026-10-12T03:00:00Z'),
  updatedAt: Temporal.Instant.from('2026-10-12T03:00:00Z'),
};

describe('PaymentNotificationsRepository (Unit)', () => {
  const recorder = createSqlRecorder();
  const repository = new PaymentNotificationsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('appendIfNew inserts with ON CONFLICT (vendor, event_id) DO NOTHING and returns the row', async () => {
    recorder.respondWith([rowOf(webhookEvents, event)]);

    expect(
      await repository.appendIfNew({
        vendor: 'demo-pay',
        eventId: 'evt_1',
        eventType: 'payment.succeeded',
        payload: { id: 'evt_1' },
      }),
    ).toEqual(event);
    const sql = recorder.statements.at(0)?.sql ?? '';
    expect(sql).toStartWith('insert into "webhook_events"');
    expect(sql).toContain('on conflict ("vendor","event_id") do nothing returning');
  });

  it('appendIfNew returns null when the event was already received', async () => {
    recorder.respondWith([]);

    expect(
      await repository.appendIfNew({
        vendor: 'demo-pay',
        eventId: 'evt_1',
        eventType: 'payment.succeeded',
        payload: {},
      }),
    ).toBeNull();
  });
});
