import { z } from 'zod';

export const githubIdSchema = z.string().regex(/^[1-9][0-9]*$/);
export const githubUsernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/);
export const memberProfileSchema = z.object({
  githubId: githubIdSchema,
  login: githubUsernameSchema,
});
export const memberSummarySchema = memberProfileSchema.extend({
  status: z.enum(['invited', 'active', 'revoked']),
});
export type MemberSummary = z.infer<typeof memberSummarySchema>;
