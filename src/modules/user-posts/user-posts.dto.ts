import { z } from 'zod';

/** A post from the external JSONPlaceholder integration, as exposed by this API. */
export const externalPostSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  title: z.string(),
  body: z.string(),
});
