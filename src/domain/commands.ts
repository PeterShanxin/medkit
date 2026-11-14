import { z } from 'zod';
import {
  batchFields,
  consultationFields,
  doseFields,
  episodeFields,
  idSchema,
  medicineFields,
  notesSchema,
  observationFields,
  profileFields,
  quantitySchema,
  regimenFields,
  regimenStatusSchema,
  timestampSchema,
} from './model';

export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('medicine.save'),
      id: idSchema,
      data: medicineFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('medicine.archive'),
      id: idSchema,
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({ type: z.literal('batch.add'), id: idSchema, data: batchFields })
    .strict(),
  z
    .object({
      type: z.literal('batch.update'),
      id: idSchema,
      data: batchFields.omit({ medicineId: true, quantity: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal('batch.adjust'),
      id: idSchema,
      quantity: quantitySchema,
      reason: notesSchema.min(1),
    })
    .strict(),
  z.object({ type: z.literal('batch.discard'), id: idSchema }).strict(),
  z
    .object({
      type: z.literal('regimen.add'),
      id: idSchema,
      data: regimenFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('regimen.status'),
      id: idSchema,
      status: regimenStatusSchema,
    })
    .strict(),
  z
    .object({ type: z.literal('dose.record'), id: idSchema, data: doseFields })
    .strict(),
  z
    .object({
      type: z.literal('dose.void'),
      id: idSchema,
      reason: notesSchema.min(1),
      returnStock: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('episode.add'),
      id: idSchema,
      data: episodeFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('episode.resolve'),
      id: idSchema,
      at: timestampSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('observation.add'),
      id: idSchema,
      data: observationFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('consultation.add'),
      id: idSchema,
      data: consultationFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('profile.save'),
      id: idSchema,
      data: profileFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('preferences.save'),
      id: idSchema,
      theme: z.enum(['system', 'light', 'dark']),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;

export interface Mutation {
  operationId: string;
  commands: Command[];
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
