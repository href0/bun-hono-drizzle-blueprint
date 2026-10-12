import { eq } from 'drizzle-orm';
import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { partnerCredentials, type PartnerCredential } from '../../database/schema';

/**
 * Partner credentials: a standalone table. Reads, paging, create, audited update / soft delete /
 * restore come from BaseRepository.
 */
export class PartnerCredentialsRepository extends BaseRepository<typeof partnerCredentials> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    // Key material never reaches record_changes (a change is still recorded, as [REDACTED]).
    super(partnerCredentials, txHost, { redact: ['apiKeyHash', 'encryptedSecret'] });
  }

  /** The live credential whose API key has this SHA-256 hex (the partner gateway lookup). */
  async findByApiKeyHash(apiKeyHash: string): Promise<PartnerCredential | null> {
    const rows = await this.txHost.tx
      .select()
      .from(partnerCredentials)
      .where(this.scoped(eq(partnerCredentials.apiKeyHash, apiKeyHash)))
      .limit(1);
    return rows.at(0) ?? null;
  }
}

export const partnerCredentialsRepository = new PartnerCredentialsRepository();
