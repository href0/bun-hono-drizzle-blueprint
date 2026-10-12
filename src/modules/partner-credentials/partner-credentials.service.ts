import { z } from 'zod';
import { CACHE_KEYS, CACHE_TTL, cacheService, type CacheService } from '../../core/cache';
import { ConflictError, NotFoundError } from '../../core/errors';
import type { PartnerGatewayCredential } from '../../core/middlewares/partner-auth';
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

/** Cached gateway views are JSON; a malformed entry is a miss (CacheService `revive`). */
const gatewayCredentialSchema = z.object({
  partnerCode: z.string(),
  encryptedSecret: z.string(),
  ipWhitelist: z.array(z.string()),
  allowedRoutes: z.array(z.string()),
  rateLimitRpm: z.number().int(),
  isActive: z.boolean(),
});

const toGatewayCredential = (credential: PartnerCredential): PartnerGatewayCredential => ({
  partnerCode: credential.partnerCode,
  encryptedSecret: credential.encryptedSecret,
  ipWhitelist: credential.ipWhitelist,
  allowedRoutes: credential.allowedRoutes,
  rateLimitRpm: credential.rateLimitRpm,
  isActive: credential.isActive,
});

const codeTaken = (): ConflictError =>
  new ConflictError(PARTNER_CREDENTIAL_MESSAGES.CODE_TAKEN, {
    details: [{ field: 'partner_code', message: PARTNER_CREDENTIAL_MESSAGES.CODE_NOT_REUSABLE }],
  });

export class PartnerCredentialsService {
  constructor(
    private readonly repo: PartnerCredentialsRepository = partnerCredentialsRepository,
    private readonly cipher: SecretCipher = partnerSecretCipher,
    private readonly cache: CacheService = cacheService,
  ) {}

  /**
   * The partner gateway lookup (`partnerAuth()`): the live credential for an API key hash, cached
   * (`CACHE_TTL.PARTNER_CREDENTIAL`), unknown keys too (`PARTNER_CREDENTIAL_MISS`) so a flood of
   * bad keys does not reach the database. Every change below drops the entry at once.
   */
  async findForGateway(apiKeyHash: string): Promise<PartnerGatewayCredential | null> {
    return this.cache.getOrSet(
      CACHE_KEYS.partnerCredential(apiKeyHash),
      CACHE_TTL.PARTNER_CREDENTIAL,
      async () => {
        const credential = await this.repo.findByApiKeyHash(apiKeyHash);
        return credential ? toGatewayCredential(credential) : null;
      },
      {
        negativeTtl: CACHE_TTL.PARTNER_CREDENTIAL_MISS,
        revive: (raw) => gatewayCredentialSchema.parse(raw),
      },
    );
  }

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
      // A negative entry for this hash cannot exist (the key is new), but stay exact.
      await this.forget(apiKeyHash);
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

  /** New API key; the old one stops matching at once (no overlap window, cache entry dropped). */
  async rotateApiKey(id: string): Promise<{ credential: PartnerCredential; apiKey: string }> {
    const previous = await this.getCredentialById(id);
    const { apiKey, apiKeyHash, apiKeyPrefix } = issuePartnerApiKey();
    const credential = await this.updateOrFail(id, { apiKeyHash, apiKeyPrefix });
    await this.forget(previous.apiKeyHash);
    return { credential, apiKey };
  }

  /** Soft delete: the partner is refused; the code stays reserved; `restoreCredential` undoes it. */
  async deleteCredential(id: string): Promise<void> {
    const deleted = await this.repo.softDeleteById(id);
    if (!deleted) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    await this.forget(deleted.apiKeyHash);
  }

  async restoreCredential(id: string): Promise<PartnerCredential> {
    const restored = await this.repo.restoreById(id);
    if (!restored) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    await this.forget(restored.apiKeyHash);
    return restored;
  }

  private async updateOrFail(
    id: string,
    patch: Parameters<PartnerCredentialsRepository['updateById']>[1],
  ): Promise<PartnerCredential> {
    const updated = await this.repo.updateById(id, patch);
    if (!updated) throw new NotFoundError(partnerCredentialNotFoundMessage(id));
    await this.forget(updated.apiKeyHash);
    return updated;
  }

  /** Drops the gateway's cached view of a credential, so a change applies to the next request. */
  private async forget(apiKeyHash: string): Promise<void> {
    await this.cache.del(CACHE_KEYS.partnerCredential(apiKeyHash));
  }
}

export const partnerCredentialsService = new PartnerCredentialsService();
