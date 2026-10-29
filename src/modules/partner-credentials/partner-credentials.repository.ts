import { and, eq } from 'drizzle-orm';
import {
  BaseRepository,
  defaultTxHost,
  instantRange,
  type ListColumns,
  type TransactionHost,
} from '../../database';
import { partnerCredentials, type PartnerCredential } from '../../database/schema';
import type {
  PartnerCredentialListQueryDto,
  PartnerCredentialSortField,
} from './partner-credentials.dto';

/** The list's allowlist (D41): sortable fields → columns, and the columns `q` searches. */
const PARTNER_CREDENTIAL_LIST_COLUMNS: ListColumns<PartnerCredentialSortField> = {
  sort: {
    createdAt: partnerCredentials.createdAt,
    updatedAt: partnerCredentials.updatedAt,
    partnerCode: partnerCredentials.partnerCode,
    partnerName: partnerCredentials.partnerName,
  },
  search: [partnerCredentials.partnerCode, partnerCredentials.partnerName],
};

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

  /** A page of live credentials for the admin list, and the total under the same filters. */
  async findCredentialList(
    query: PartnerCredentialListQueryDto,
  ): Promise<{ rows: PartnerCredential[]; total: number }> {
    return this.findList(
      query,
      PARTNER_CREDENTIAL_LIST_COLUMNS,
      and(
        query.isActive === undefined ? undefined : eq(partnerCredentials.isActive, query.isActive),
        instantRange(partnerCredentials.createdAt, query.createdFrom, query.createdTo),
      ),
    );
  }
}

export const partnerCredentialsRepository = new PartnerCredentialsRepository();
