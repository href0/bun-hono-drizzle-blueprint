import { describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { diffRecords, REDACTED, snapshotRecord } from './record-diff.util';

const at = (iso: string): Temporal.Instant => Temporal.Instant.from(iso);

describe('diffRecords', () => {
  const before = {
    name: 'A',
    isActive: true,
    secret: 'old',
    updatedAt: at('2026-10-05T00:00:00Z'),
    dueAt: at('2026-10-05T00:00:00Z'),
    meta: { b: 1, a: 2 },
    note: null as string | null,
  };

  it('returns only the keys whose values changed', () => {
    expect(diffRecords(before, { name: 'B', isActive: true })).toEqual({
      name: { from: 'A', to: 'B' },
    });
  });

  it('returns {} when nothing changed', () => {
    expect(diffRecords(before, { name: 'A', isActive: true })).toEqual({});
  });

  it('skips keys whose patch value is undefined (not set)', () => {
    expect(diffRecords(before, { name: undefined })).toEqual({});
  });

  it('compares and stores Temporal values in their JSON form', () => {
    expect(diffRecords(before, { dueAt: at('2026-10-05T00:00:00Z') })).toEqual({});
    expect(diffRecords(before, { dueAt: at('2026-10-06T00:00:00Z') })).toEqual({
      dueAt: { from: '2026-10-05T00:00:00Z', to: '2026-10-06T00:00:00Z' },
    });
  });

  it('treats objects with the same members in another key order as unchanged (jsonb)', () => {
    expect(diffRecords(before, { meta: { a: 2, b: 1 } })).toEqual({});
    expect(diffRecords(before, { meta: { a: 3, b: 1 } })).toEqual({
      meta: { from: { b: 1, a: 2 }, to: { a: 3, b: 1 } },
    });
  });

  it('records changes from and to null', () => {
    expect(diffRecords(before, { note: 'x' })).toEqual({ note: { from: null, to: 'x' } });
    expect(diffRecords({ note: 'x' }, { note: null })).toEqual({ note: { from: 'x', to: null } });
  });

  it('records a change to a key missing from before as from null', () => {
    expect(diffRecords({}, { name: 'A' })).toEqual({ name: { from: null, to: 'A' } });
  });

  it('ignores the given keys', () => {
    expect(
      diffRecords(before, { updatedAt: at('2026-10-06T00:00:00Z') }, { ignore: ['updatedAt'] }),
    ).toEqual({});
  });

  it('records that a redacted key changed without its values', () => {
    expect(diffRecords(before, { secret: 'new' }, { redact: ['secret'] })).toEqual({
      secret: { from: REDACTED, to: REDACTED },
    });
    expect(diffRecords(before, { secret: 'old' }, { redact: ['secret'] })).toEqual({});
  });
});

describe('snapshotRecord', () => {
  it('returns every key in JSON form with redacted keys masked', () => {
    expect(
      snapshotRecord(
        { name: 'A', secret: 's', createdAt: at('2026-10-05T00:00:00Z'), note: null },
        { redact: ['secret'] },
      ),
    ).toEqual({ name: 'A', secret: REDACTED, createdAt: '2026-10-05T00:00:00Z', note: null });
  });

  it('works without options', () => {
    expect(snapshotRecord({ name: 'A' })).toEqual({ name: 'A' });
  });
});
