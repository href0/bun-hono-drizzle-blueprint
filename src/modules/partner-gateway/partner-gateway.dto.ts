import { z } from 'zod';
import { isoInstant } from '../../core/openapi';

/** `POST /partner/echo`: any JSON body with a message, returned as received after verification. */
export const partnerEchoSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000),
});

export type PartnerEchoDto = z.infer<typeof partnerEchoSchema>;

export const partnerPingResponseSchema = z.object({
  /** The partner the signature was verified for (`partner:<code>` actor). */
  partnerCode: z.string(),
  serverTime: isoInstant(),
});

export type PartnerPingResponse = z.infer<typeof partnerPingResponseSchema>;

export const partnerEchoResponseSchema = partnerPingResponseSchema.extend({
  message: z.string(),
});

export type PartnerEchoResponse = z.infer<typeof partnerEchoResponseSchema>;
