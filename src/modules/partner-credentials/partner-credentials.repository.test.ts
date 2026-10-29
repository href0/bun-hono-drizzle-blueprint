import { beforeEach, describe, expect, it } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { PartnerCredentialsRepository } from './partner-credentials.repository';
import { partnerCredentials, type PartnerCredential } from '../../database/schema';
import { createSqlRecorder, rowOf } from '../../../test/helpers/sql-recorder';

const COLUMNS =
  '"id", "partner_code", "partner_name", "api_key_hash", "api_key_prefix", "encrypted_secret", "ip_whitelist", "allowed_routes", "rate_limit_rpm", "is_active", "created_at", "updated_at", "created_by", "updated_by", "deleted_at"';

/** Generic behaviour (paging, audited update, soft delete, restore) is tested in base.repository.test.ts. */
describe('PartnerCredentialsRepository (Unit)', () => {
  const sample: PartnerCredential = {
    id: '0192f1d0-7c2e-7a51-9b3e-4f5a6b7c8d9e',
    partnerCode: 'acme',
    partnerName: 'Acme Corp',
    apiKeyHash: 'a'.repeat(64),
    apiKeyPrefix: 'pk_abcdefgh',
    encryptedSecret: 'v1.test.iv.tag.ciphertext',
    ipWhitelist: ['203.0.113.0/24'],
    allowedRoutes: ['/orders/*'],
    rateLimitRpm: 60,
    isActive: true,
    createdAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    updatedAt: Temporal.Instant.from('2026-10-05T03:00:00Z'),
    createdBy: 'system',
    updatedBy: 'system',
    deletedAt: null,
  };

  const recorder = createSqlRecorder();
  const repo = new PartnerCredentialsRepository(recorder.txHost);

  beforeEach(() => {
    recorder.reset();
  });

  it('reads live rows of partner_credentials', async () => {
    recorder.respondWith([rowOf(partnerCredentials, sample)]);

    expect(await repo.findById(sample.id)).toEqual(sample);
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "partner_credentials" where ("partner_credentials"."deleted_at" is null and "partner_credentials"."id" = $1) limit $2`,
        params: [sample.id, 1],
      },
    ]);
  });

  it('findByApiKeyHash looks up live credentials only (the gateway lookup)', async () => {
    recorder.respondWith([rowOf(partnerCredentials, sample)]);

    expect(await repo.findByApiKeyHash(sample.apiKeyHash)).toEqual(sample);
    expect(recorder.statements).toEqual([
      {
        sql: `select ${COLUMNS} from "partner_credentials" where ("partner_credentials"."deleted_at" is null and "partner_credentials"."api_key_hash" = $1) limit $2`,
        params: [sample.apiKeyHash, 1],
      },
    ]);
  });

  it('findByApiKeyHash returns null for an unknown hash', async () => {
    expect(await repo.findByApiKeyHash('f'.repeat(64))).toBeNull();
  });

  it('redacts the API key hash and the encrypted secret in record_changes', async () => {
    recorder.respondWith([rowOf(partnerCredentials, sample)], [rowOf(partnerCredentials, sample)]);

    await repo.updateById(sample.id, {
      apiKeyHash: 'b'.repeat(64),
      encryptedSecret: 'v1.test.new-iv.new-tag.new-ciphertext',
      apiKeyPrefix: 'pk_zyxwvuts',
    });

    const audit = recorder.statements.find((statement) =>
      statement.sql.startsWith('insert into "record_changes"'),
    );
    expect(audit?.params[3]).toBe(
      JSON.stringify({
        api_key_hash: { from: '[REDACTED]', to: '[REDACTED]' },
        encrypted_secret: { from: '[REDACTED]', to: '[REDACTED]' },
        api_key_prefix: { from: 'pk_abcdefgh', to: 'pk_zyxwvuts' },
      }),
    );
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('b'.repeat(64));
    expect(serialized).not.toContain('new-ciphertext');
    expect(serialized).not.toContain(sample.encryptedSecret);
  });

  it('lists by the allowlist with is_active and the created range on the page and the total (D41)', async () => {
    recorder.respondWith([rowOf(partnerCredentials, sample)], [[1]]);

    const result = await repo.findCredentialList({
      page: 1,
      perPage: 10,
      sort: [{ field: 'partnerCode', direction: 'desc' }],
      q: 'acme',
      isActive: false,
      createdFrom: Temporal.Instant.from('2026-10-01T00:00:00Z'),
    });

    expect(result).toEqual({ rows: [sample], total: 1 });
    const where =
      'where ("partner_credentials"."deleted_at" is null and (("partner_credentials"."partner_code" ilike $1 or "partner_credentials"."partner_name" ilike $2) and ("partner_credentials"."is_active" = $3 and "partner_credentials"."created_at" >= $4)))';
    expect(recorder.statements.map((statement) => statement.sql)).toEqual([
      `select ${COLUMNS} from "partner_credentials" ${where} order by "partner_credentials"."partner_code" desc, "partner_credentials"."id" desc limit $5`,
      `select count(*) from "partner_credentials" ${where}`,
    ]);
  });

  it('lists without filters: only the live-row scope', async () => {
    recorder.respondWith([], [[0]]);

    expect(await repo.findCredentialList({ page: 1, perPage: 10 })).toEqual({ rows: [], total: 0 });
    expect(recorder.statements.at(1)?.sql).toBe(
      'select count(*) from "partner_credentials" where "partner_credentials"."deleted_at" is null',
    );
  });
});
