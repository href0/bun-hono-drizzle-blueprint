import { Hono } from 'hono';
import { z } from 'zod';
import { uuidParamSchema } from '../../core/dto/common.dto';
import { requireRole, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { partnerCredentialsController } from './partner-credentials.controller';
import { PARTNER_CREDENTIAL_MESSAGES } from './partner-credentials.messages';
import {
  createPartnerCredentialSchema,
  issuedPartnerCredentialSchema,
  partnerCredentialListQuerySchema,
  partnerCredentialResponseSchema,
  rotatedApiKeySchema,
  rotatedSecretSchema,
  updatePartnerCredentialSchema,
} from './partner-credentials.dto';

export const partnerCredentialRoutes = new Hono();

const tags = ['Partner credentials'];

/** Partner credentials are managed by admins only. */
const adminOnly = requireRole('admin');

partnerCredentialRoutes.post(
  '/',
  describeEndpoint({
    tags,
    summary: 'Create a partner credential (returns the API key and secret once)',
    response: {
      status: 201,
      description: 'Created',
      message: PARTNER_CREDENTIAL_MESSAGES.CREATED,
      data: issuedPartnerCredentialSchema,
    },
    errors: [409],
  }),
  adminOnly,
  validate({ body: createPartnerCredentialSchema }),
  partnerCredentialsController.create,
);
partnerCredentialRoutes.get(
  '/',
  describeEndpoint({
    tags,
    summary: 'List partner credentials (paginated, sortable, searchable)',
    response: {
      status: 200,
      description: 'A page of credentials',
      message: PARTNER_CREDENTIAL_MESSAGES.LIST_RETRIEVED,
      paginatedItem: partnerCredentialResponseSchema,
    },
  }),
  adminOnly,
  validate({ query: partnerCredentialListQuerySchema }),
  partnerCredentialsController.list,
);
partnerCredentialRoutes.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a partner credential by id',
    response: {
      status: 200,
      description: 'Found',
      message: PARTNER_CREDENTIAL_MESSAGES.RETRIEVED,
      data: partnerCredentialResponseSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.getById,
);
partnerCredentialRoutes.patch(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Update a partner credential (only the given fields)',
    response: {
      status: 200,
      description: 'Updated',
      message: PARTNER_CREDENTIAL_MESSAGES.UPDATED,
      data: partnerCredentialResponseSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema, body: updatePartnerCredentialSchema }),
  partnerCredentialsController.update,
);
partnerCredentialRoutes.post(
  '/:id/activate',
  describeEndpoint({
    tags,
    summary: 'Activate a partner credential',
    response: {
      status: 200,
      description: 'Activated',
      message: PARTNER_CREDENTIAL_MESSAGES.ACTIVATED,
      data: partnerCredentialResponseSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.activate,
);
partnerCredentialRoutes.post(
  '/:id/deactivate',
  describeEndpoint({
    tags,
    summary: 'Deactivate a partner credential (its requests are refused)',
    response: {
      status: 200,
      description: 'Deactivated',
      message: PARTNER_CREDENTIAL_MESSAGES.DEACTIVATED,
      data: partnerCredentialResponseSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.deactivate,
);
partnerCredentialRoutes.post(
  '/:id/secret-rotations',
  describeEndpoint({
    tags,
    summary: 'Rotate the HMAC secret (returns the new secret once; the old one stops working)',
    response: {
      status: 201,
      description: 'Rotated',
      message: PARTNER_CREDENTIAL_MESSAGES.SECRET_ROTATED,
      data: rotatedSecretSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.rotateSecret,
);
partnerCredentialRoutes.post(
  '/:id/api-key-rotations',
  describeEndpoint({
    tags,
    summary: 'Rotate the API key (returns the new key once; the old one stops working)',
    response: {
      status: 201,
      description: 'Rotated',
      message: PARTNER_CREDENTIAL_MESSAGES.API_KEY_ROTATED,
      data: rotatedApiKeySchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.rotateApiKey,
);
partnerCredentialRoutes.delete(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Delete a partner credential (soft delete; the code stays reserved)',
    response: {
      status: 200,
      description: 'Deleted',
      message: PARTNER_CREDENTIAL_MESSAGES.DELETED,
      data: z.null(),
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.remove,
);
partnerCredentialRoutes.post(
  '/:id/restore',
  describeEndpoint({
    tags,
    summary: 'Restore a soft-deleted partner credential',
    response: {
      status: 200,
      description: 'Restored',
      message: PARTNER_CREDENTIAL_MESSAGES.RESTORED,
      data: partnerCredentialResponseSchema,
    },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.restore,
);
