import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  proposalInputSchema,
  reviewSchema,
  type ProposalInput,
  type Review,
} from '../../src/application/connected/contracts';
import { idSchema } from '../../src/domain/model';

export interface AuthorizedWriter {
  prepare(input: ProposalInput): Promise<Review>;
  status(id: string): Promise<Review>;
  reviewUrl: string;
}
export function registerWriteTools(
  server: McpServer,
  writer: AuthorizedWriter,
) {
  const outputSchema = z.object({
    review: reviewSchema,
    reviewUrl: z.string().url(),
    recorded: z.boolean(),
  });
  const result = (review: Review) => {
    const output = outputSchema.parse({
      review,
      reviewUrl: `${writer.reviewUrl}?review=${review.id}`,
      recorded: review.status === 'applied',
    });
    return {
      structuredContent: output,
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    };
  };
  server.registerTool(
    'prepare_record_change',
    {
      description:
        'Prepare a medicine, batch, actual dose, symptom, recovery, stock adjustment, or dose correction for the owner to review in MedKit. This does NOT save a medical record. Use only an explicit user request; a suggestion or schedule is never evidence of consumption. Ask for missing identity, amount, unit, time, and batch details; never infer these. Preserve requestId and identical input when retrying. The owner must open reviewUrl and confirm. Never claim the change was recorded until status is applied. No prescription plans or diagnoses can be changed. Extracted labels remain unverified.',
      inputSchema: proposalInputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        return result(await writer.prepare(input));
      } catch {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'The change could not be prepared. Check permissions and record details. No medical record was saved.',
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    'get_record_change_status',
    {
      description:
        'Read the status of this connection’s proposed change. Only applied means that the owner confirmed and the record was saved. Pending requests expire after ten minutes and become stale when records change.',
      inputSchema: z.object({ id: idSchema }).strict(),
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        return result(await writer.status(id));
      } catch {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: 'This change is unavailable or access was revoked.',
            },
          ],
        };
      }
    },
  );
}
