import { Hono } from 'hono';
import { z } from 'zod';
import { paginationQuerySchema, uuidParamSchema } from '../../core/dto/common.dto';
import { requireRole, validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { partnerCredentialsController } from './partner-credentials.controller';
import {
  createPartnerCredentialSchema,
  issuedPartnerCredentialSchema,
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
    response: { status: 201, description: 'Created', data: issuedPartnerCredentialSchema },
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
    summary: 'List partner credentials (paginated)',
    response: {
      status: 200,
      description: 'A page of credentials',
      paginatedItem: partnerCredentialResponseSchema,
    },
  }),
  adminOnly,
  validate({ query: paginationQuerySchema }),
  partnerCredentialsController.list,
);
partnerCredentialRoutes.get(
  '/:id',
  describeEndpoint({
    tags,
    summary: 'Get a partner credential by id',
    response: { status: 200, description: 'Found', data: partnerCredentialResponseSchema },
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
    response: { status: 200, description: 'Updated', data: partnerCredentialResponseSchema },
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
    response: { status: 200, description: 'Activated', data: partnerCredentialResponseSchema },
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
    response: { status: 200, description: 'Deactivated', data: partnerCredentialResponseSchema },
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
    response: { status: 201, description: 'Rotated', data: rotatedSecretSchema },
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
    response: { status: 201, description: 'Rotated', data: rotatedApiKeySchema },
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
    response: { status: 200, description: 'Deleted', data: z.null() },
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
    response: { status: 200, description: 'Restored', data: partnerCredentialResponseSchema },
    errors: [404],
  }),
  adminOnly,
  validate({ params: uuidParamSchema }),
  partnerCredentialsController.restore,
);
