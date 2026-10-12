import type { PartnerCredential } from '../../database/schema';
import type {
  IssuedPartnerCredentialResponse,
  PartnerCredentialResponse,
  RotatedApiKeyResponse,
  RotatedSecretResponse,
} from './partner-credentials.dto';

/** Never the API key hash or the encrypted secret: only fields named here leave the API. */
export const toPartnerCredentialResponse = (
  credential: PartnerCredential,
): PartnerCredentialResponse => ({
  id: credential.id,
  partnerCode: credential.partnerCode,
  partnerName: credential.partnerName,
  apiKeyPrefix: credential.apiKeyPrefix,
  ipWhitelist: credential.ipWhitelist,
  allowedRoutes: credential.allowedRoutes,
  rateLimitRpm: credential.rateLimitRpm,
  isActive: credential.isActive,
  createdAt: credential.createdAt,
  updatedAt: credential.updatedAt,
});

export const toPartnerCredentialListResponse = (
  credentials: PartnerCredential[],
): PartnerCredentialResponse[] => credentials.map(toPartnerCredentialResponse);

export const toIssuedPartnerCredentialResponse = (issued: {
  credential: PartnerCredential;
  apiKey: string;
  secret: string;
}): IssuedPartnerCredentialResponse => ({
  ...toPartnerCredentialResponse(issued.credential),
  apiKey: issued.apiKey,
  secret: issued.secret,
});

export const toRotatedApiKeyResponse = (rotated: {
  credential: PartnerCredential;
  apiKey: string;
}): RotatedApiKeyResponse => ({
  ...toPartnerCredentialResponse(rotated.credential),
  apiKey: rotated.apiKey,
});

export const toRotatedSecretResponse = (rotated: {
  credential: PartnerCredential;
  secret: string;
}): RotatedSecretResponse => ({
  ...toPartnerCredentialResponse(rotated.credential),
  secret: rotated.secret,
});
