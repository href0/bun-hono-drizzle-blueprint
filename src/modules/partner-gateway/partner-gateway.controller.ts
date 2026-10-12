import { asyncHandler, currentPartner, getValidatedBody } from '../../core/middlewares';
import { ApiResponse } from '../../core/response';
import { nowInstant } from '../../utils/datetime.util';
import type {
  PartnerEchoDto,
  PartnerEchoResponse,
  PartnerPingResponse,
} from './partner-gateway.dto';
import { PARTNER_GATEWAY_MESSAGES } from './partner-gateway.messages';

/**
 * Example partner endpoints behind `partnerAuth()`: a partner checks its signing implementation
 * with `GET /partner/ping` (no body) and `POST /partner/echo` (JSON body).
 */
export class PartnerGatewayController {
  ping = asyncHandler(() => {
    const data: PartnerPingResponse = {
      partnerCode: currentPartner().code,
      serverTime: nowInstant(),
    };
    return Promise.resolve(new ApiResponse(data, PARTNER_GATEWAY_MESSAGES.PONG, 200));
  });

  echo = asyncHandler((c) => {
    const dto = getValidatedBody<PartnerEchoDto>(c);
    const data: PartnerEchoResponse = {
      partnerCode: currentPartner().code,
      serverTime: nowInstant(),
      message: dto.message,
    };
    return Promise.resolve(new ApiResponse(data, PARTNER_GATEWAY_MESSAGES.ECHOED, 200));
  });
}

export const partnerGatewayController = new PartnerGatewayController();
