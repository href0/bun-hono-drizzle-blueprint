import { ConflictError, NotFoundError } from '../../core/errors';
import {
  issuePartnerApiKey,
  issuePartnerSecret,
  partnerSecretCipher,
} from '../../core/security/partner-credentials';
import { isUniqueViolation } from '../../database/unique-violation';
import type { PaginationQueryDto } from '../../core/dto/common.dto';
import type { PartnerCredential } from '../../database/schema';
import type { SecretCipher } from '../../utils/secret-cipher.util';
import type {
  CreatePartnerCredentialDto,
  UpdatePartnerCredentialDto,
} from './partner-credentials.dto';
import {
  PARTNER_CREDENTIAL_MESSAGES,
  partnerCredentialNotFoundMessage,
} from './partner-credentials.messages';
import {
  PartnerCredentialsRepository,
  partnerCredentialsRepository,
} from './partner-credentials.repository';

/** A credential plus the values shown once: they exist only in this response, never stored. */
export interface IssuedPartnerCredential {
  credential: PartnerCredential;
  apiKey: string;
  secret: string;
}

const codeTaken = (): ConflictError =>
  new ConflictError(PARTNER_CREDENTIAL_MESSAGES.CODE_TAKEN, {
    details: [{ field: 'partner_code', message: PARTNER_CREDENTIAL_MESSAGES.CODE_NOT_REUSABLE }],
  });

export class PartnerCredentialsService {
  constructor(
    private readonly repo: PartnerCredentialsRepository = partnerCredentialsRepository,
    private readonly cipher: SecretCipher = partnerSecretCipher,
  ) {}

  /**
   * The partner code is unique forever (also against deleted credentials): the insert's unique
   * index decides, so two concurrent creates cannot both win.
   */
  async createCredential(dto: CreatePartnerCredentialDto): Promise<IssuedPartnerCredential> {
    const { apiKey, apiKeyHash, apiKeyPrefix } = issuePartnerApiKey();
    const secret = issuePartnerSecret();
    try {
      const credential = await this.repo.create({
        ...dto,
        apiKeyHash,
        apiKeyPrefix,
        encryptedSecret: this.cipher.encrypt(secret),
        isActive: true,
      });
      return { credential, apiKey, secret };
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
  }

  async getCredentialById(id: string): Promise<PartnerCredential> {
    const credential = await this.repo.findById(id);
    if (!credential) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    return credential;
  }

  /** Live credentials, newest first (stable order: created_at DESC, id DESC). */
  async listCredentials(
    query: PaginationQueryDto,
  ): Promise<{ credentials: PartnerCredential[]; total: number }> {
    const [credentials, total] = await Promise.all([
      this.repo.findPage({ page: query.page, perPage: query.perPage }),
      this.repo.count(),
    ]);
    return { credentials, total };
  }

  async updateCredential(id: string, dto: UpdatePartnerCredentialDto): Promise<PartnerCredential> {
    return this.updateOrFail(id, dto);
  }

  /** A deactivated partner is refused by the gateway; its keys stay valid for reactivation. */
  async setActive(id: string, isActive: boolean): Promise<PartnerCredential> {
    return this.updateOrFail(id, { isActive });
  }

  /** New HMAC secret; the old one stops verifying at once (no overlap window). */
  async rotateSecret(id: string): Promise<{ credential: PartnerCredential; secret: string }> {
    const secret = issuePartnerSecret();
    const credential = await this.updateOrFail(id, {
      encryptedSecret: this.cipher.encrypt(secret),
    });
    return { credential, secret };
  }

  /** New API key; the old one stops matching at once (no overlap window). */
  async rotateApiKey(id: string): Promise<{ credential: PartnerCredential; apiKey: string }> {
    const { apiKey, apiKeyHash, apiKeyPrefix } = issuePartnerApiKey();
    const credential = await this.updateOrFail(id, { apiKeyHash, apiKeyPrefix });
    return { credential, apiKey };
  }

  /** Soft delete: the partner is refused; the code stays reserved; `restoreCredential` undoes it. */
  async deleteCredential(id: string): Promise<void> {
    const deleted = await this.repo.softDeleteById(id);
    if (!deleted) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
  }

  async restoreCredential(id: string): Promise<PartnerCredential> {
    const restored = await this.repo.restoreById(id);
    if (!restored) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    return restored;
  }

  private async updateOrFail(
    id: string,
    patch: Parameters<PartnerCredentialsRepository['updateById']>[1],
  ): Promise<PartnerCredential> {
    const updated = await this.repo.updateById(id, patch);
    if (!updated) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    return updated;
  }
}

export const partnerCredentialsService = new PartnerCredentialsService();
