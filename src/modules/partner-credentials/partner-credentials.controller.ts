import {
  asyncHandler,
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import type { UuidParamDto } from '../../core/dto/common.dto';
import type {
  CreatePartnerCredentialDto,
  PartnerCredentialListQueryDto,
  UpdatePartnerCredentialDto,
} from './partner-credentials.dto';
import { PARTNER_CREDENTIAL_MESSAGES } from './partner-credentials.messages';
import {
  partnerCredentialsService,
  PartnerCredentialsService,
} from './partner-credentials.service';
import {
  toIssuedPartnerCredentialResponse,
  toPartnerCredentialListResponse,
  toPartnerCredentialResponse,
  toRotatedApiKeyResponse,
  toRotatedSecretResponse,
} from './partner-credentials.transformer';

export class PartnerCredentialsController {
  constructor(private readonly service: PartnerCredentialsService = partnerCredentialsService) {}

  create = asyncHandler(async (c) => {
    const dto = getValidatedBody<CreatePartnerCredentialDto>(c);
    const issued = await this.service.createCredential(dto);

    return new ApiResponse(
      toIssuedPartnerCredentialResponse(issued),
      PARTNER_CREDENTIAL_MESSAGES.CREATED,
      201,
    );
  });

  list = asyncHandler(async (c) => {
    const query = getValidatedQuery<PartnerCredentialListQueryDto>(c);
    const { credentials, total } = await this.service.listCredentials(query);
    const totalPages = Math.ceil(total / query.perPage) || 1;

    return new ApiResponse(
      toPartnerCredentialListResponse(credentials),
      PARTNER_CREDENTIAL_MESSAGES.LIST_RETRIEVED,
      200,
      { currentPage: query.page, perPage: query.perPage, totalItems: total, totalPages },
    );
  });

  getById = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const credential = await this.service.getCredentialById(param.id);

    return new ApiResponse(
      toPartnerCredentialResponse(credential),
      PARTNER_CREDENTIAL_MESSAGES.RETRIEVED,
      200,
    );
  });

  update = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const dto = getValidatedBody<UpdatePartnerCredentialDto>(c);
    const credential = await this.service.updateCredential(param.id, dto);

    return new ApiResponse(
      toPartnerCredentialResponse(credential),
      PARTNER_CREDENTIAL_MESSAGES.UPDATED,
      200,
    );
  });

  activate = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const credential = await this.service.setActive(param.id, true);

    return new ApiResponse(
      toPartnerCredentialResponse(credential),
      PARTNER_CREDENTIAL_MESSAGES.ACTIVATED,
      200,
    );
  });

  deactivate = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const credential = await this.service.setActive(param.id, false);

    return new ApiResponse(
      toPartnerCredentialResponse(credential),
      PARTNER_CREDENTIAL_MESSAGES.DEACTIVATED,
      200,
    );
  });

  rotateSecret = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const rotated = await this.service.rotateSecret(param.id);

    return new ApiResponse(
      toRotatedSecretResponse(rotated),
      PARTNER_CREDENTIAL_MESSAGES.SECRET_ROTATED,
      201,
    );
  });

  rotateApiKey = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const rotated = await this.service.rotateApiKey(param.id);

    return new ApiResponse(
      toRotatedApiKeyResponse(rotated),
      PARTNER_CREDENTIAL_MESSAGES.API_KEY_ROTATED,
      201,
    );
  });

  remove = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    await this.service.deleteCredential(param.id);

    return new ApiResponse(null, PARTNER_CREDENTIAL_MESSAGES.DELETED, 200);
  });

  restore = asyncHandler(async (c) => {
    const param = getValidatedParams<UuidParamDto>(c);
    const credential = await this.service.restoreCredential(param.id);

    return new ApiResponse(
      toPartnerCredentialResponse(credential),
      PARTNER_CREDENTIAL_MESSAGES.RESTORED,
      200,
    );
  });
}

export const partnerCredentialsController = new PartnerCredentialsController();
