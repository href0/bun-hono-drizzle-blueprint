import { BaseRepository, defaultTxHost, type TransactionHost } from '../../database';
import { partnerCredentials } from '../../database/schema';

/**
 * Partner credentials: a standalone table. Reads, paging, create, audited update / soft delete /
 * restore come from BaseRepository.
 */
export class PartnerCredentialsRepository extends BaseRepository<typeof partnerCredentials> {
  constructor(txHost: TransactionHost = defaultTxHost) {
    // Key material never reaches record_changes (a change is still recorded, as [REDACTED]).
    super(partnerCredentials, txHost, { redact: ['apiKeyHash', 'encryptedSecret'] });
  }
}

export const partnerCredentialsRepository = new PartnerCredentialsRepository();
