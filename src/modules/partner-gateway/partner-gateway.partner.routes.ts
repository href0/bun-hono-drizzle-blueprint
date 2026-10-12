import { Hono } from 'hono';
import { validate } from '../../core/middlewares';
import { describeEndpoint } from '../../core/openapi';
import { partnerGatewayController } from './partner-gateway.partner.controller';
import {
  partnerEchoResponseSchema,
  partnerEchoSchema,
  partnerPingResponseSchema,
} from './partner-gateway.dto';

/**
 * Mounted at `<API_BASE_PATH>/v1/partner`, behind `partnerAuth()` (signed requests, not access
 * tokens). A credential reaches a route only if one of its `allowed_routes` matches it
 * (relative to this mount: `/ping`, `/echo`, `/*`).
 */
export const partnerGatewayRoutes = new Hono();

const tags = ['Partner gateway'];

partnerGatewayRoutes.get(
  '/ping',
  describeEndpoint({
    tags,
    summary: 'Check a signed partner request (no body)',
    response: { status: 200, description: 'Signature verified', data: partnerPingResponseSchema },
  }),
  partnerGatewayController.ping,
);
partnerGatewayRoutes.post(
  '/echo',
  describeEndpoint({
    tags,
    summary: 'Check a signed partner request with a JSON body (echoed back)',
    response: { status: 200, description: 'Signature verified', data: partnerEchoResponseSchema },
  }),
  validate({ body: partnerEchoSchema }),
  partnerGatewayController.echo,
);
