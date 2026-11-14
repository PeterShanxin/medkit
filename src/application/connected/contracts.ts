import { z } from 'zod';
import {
  batchFields,
  doseFields,
  episodeFields,
  idSchema,
  medicineFields,
  notesSchema,
  observationFields,
  quantitySchema,
  stateSchema,
  timestampSchema,
} from '../../domain/model';

export const connectionScopes = [
  'cabinet:read',
  'medication:read',
  'history:read',
  'safety:read',
  'records:write',
] as const;
export const connectionScopeSchema = z.enum(connectionScopes);
export type ConnectionScope = z.infer<typeof connectionScopeSchema>;

// AI clients can propose recordkeeping changes, not treatment instructions or verified diagnoses.
export const changeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add_medicine'),
      medicine: medicineFields,
      batch: batchFields.omit({ medicineId: true }),
    })
    .strict(),
  z.object({ kind: z.literal('add_batch'), batch: batchFields }).strict(),
  z.object({ kind: z.literal('record_dose'), dose: doseFields }).strict(),
  z
    .object({
      kind: z.literal('start_episode'),
      episode: episodeFields,
      symptoms: z.array(observationFields.omit({ episodeId: true })).max(19),
    })
    .strict(),
  z
    .object({
      kind: z.literal('record_symptom'),
      observation: observationFields,
    })
    .strict(),
  z
    .object({
      kind: z.literal('resolve_episode'),
      episodeId: idSchema,
      at: timestampSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('adjust_stock'),
      batchId: idSchema,
      quantity: quantitySchema,
      reason: notesSchema.min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('void_dose'),
      doseId: idSchema,
      reason: notesSchema.min(1),
      returnStock: z.boolean(),
    })
    .strict(),
]);
export const proposalInputSchema = z
  .object({
    requestId: z.string().min(8).max(128),
    userStatement: notesSchema.min(1),
    change: changeSchema,
  })
  .strict();
export type Change = z.infer<typeof changeSchema>;
export type ProposalInput = z.infer<typeof proposalInputSchema>;
export const reviewSchema = z.object({
  id: idSchema,
  title: z.string(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
  userStatement: z.string(),
  status: z.enum(['pending', 'applied', 'rejected', 'expired', 'stale']),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  clientName: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;
export const connectionSchema = z.object({
  id: idSchema,
  clientName: z.string(),
  scopes: z.array(connectionScopeSchema),
  expiresAt: timestampSchema,
});
export const connectedRecordsSchema = z.object({
  state: stateSchema,
  version: z.number().int().nonnegative(),
});
export type ConnectedRecords = z.infer<typeof connectedRecordsSchema>;
