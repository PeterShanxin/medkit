import { z } from 'zod';

export const idSchema = z.string().uuid();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'Enter a valid date in YYYY-MM-DD format.',
  );
export const timestampSchema = z.string().datetime({ offset: true });
export const textSchema = z.string().trim().min(1).max(200);
export const notesSchema = z.string().trim().max(4000);
export const quantitySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.00001,
    'Use no more than three decimal places.',
  );
export const positiveQuantitySchema = quantitySchema.refine(
  (value) => value > 0,
  'Enter an amount greater than zero.',
);
export const unitSchema = z.enum([
  'tablet',
  'capsule',
  'mL',
  'sachet',
  'puff',
  'drop',
  'application',
]);
export type Unit = z.infer<typeof unitSchema>;

export const ingredientSchema = z
  .object({
    name: textSchema,
    amount: positiveQuantitySchema.nullable(),
    unit: z.enum(['mg', 'mcg', 'g', 'IU', '%']),
    per: positiveQuantitySchema,
  })
  .strict();

export const medicineFields = z
  .object({
    name: textSchema,
    genericName: z.string().trim().max(200),
    aliases: z.array(textSchema).max(20),
    ingredients: z.array(ingredientSchema).max(20),
    form: textSchema,
    unit: unitSchema,
    labelChecked: z.boolean(),
    classification: z.enum(['unknown', 'otc', 'prescription']),
    classificationSource: notesSchema,
    notes: notesSchema,
  })
  .strict()
  .refine(
    (medicine) =>
      !medicine.labelChecked ||
      (medicine.ingredients.length > 0 &&
        medicine.ingredients.every((item) => item.amount !== null)),
    'Check every ingredient and strength before confirming the label.',
  )
  .refine(
    (medicine) =>
      medicine.classification === 'unknown' ||
      medicine.classificationSource.length > 0,
    'Record the source of the OTC or prescription classification.',
  );

export const medicineSchema = medicineFields.safeExtend({
  id: idSchema,
  archived: z.boolean(),
  createdAt: timestampSchema,
});
export const medicineSnapshotSchema = z
  .object({
    id: idSchema,
    name: textSchema,
    genericName: z.string(),
    ingredients: z.array(ingredientSchema),
    unit: unitSchema,
    labelChecked: z.boolean(),
  })
  .strict();
export const batchFields = z
  .object({
    medicineId: idSchema,
    quantity: quantitySchema,
    expiresOn: dateSchema.nullable(),
    acquiredOn: dateSchema.nullable(),
    location: z.string().trim().max(200),
    lowStockAt: quantitySchema,
  })
  .strict();
export const batchSchema = batchFields.extend({
  id: idSchema,
  discarded: z.boolean(),
  createdAt: timestampSchema,
});

export const regimenFields = z
  .object({
    medicineId: idSchema,
    amount: positiveQuantitySchema,
    unit: unitSchema,
    instructions: textSchema,
    kind: z.enum(['scheduled', 'as-needed']),
    times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(24),
    startOn: dateSchema,
    endOn: dateSchema.nullable(),
    source: z.enum(['user', 'clinician']),
    episodeId: idSchema.nullable(),
  })
  .strict()
  .refine(
    (plan) => !plan.endOn || plan.endOn >= plan.startOn,
    'The end date must follow the start date.',
  )
  .refine(
    (plan) => plan.kind !== 'scheduled' || plan.times.length > 0,
    'Add at least one scheduled time.',
  )
  .refine(
    (plan) => new Set(plan.times).size === plan.times.length,
    'Each scheduled time must be unique.',
  );
export const regimenStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'discontinued',
]);
export const regimenSchema = regimenFields.safeExtend({
  id: idSchema,
  medicine: medicineSnapshotSchema,
  status: regimenStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const doseFields = z
  .object({
    medicineId: idSchema,
    batchId: idSchema.nullable(),
    regimenId: idSchema.nullable(),
    episodeId: idSchema.nullable(),
    amount: positiveQuantitySchema,
    unit: unitSchema,
    at: timestampSchema,
    outcome: z.enum(['taken', 'skipped', 'missed']),
    notes: notesSchema,
    deductStock: z.boolean(),
  })
  .strict();
export const doseSchema = doseFields.extend({
  id: idSchema,
  medicine: medicineSnapshotSchema,
  recordedAt: timestampSchema,
  voidedAt: timestampSchema.nullable(),
  correctionReason: notesSchema,
  stockReturned: z.boolean(),
});
export const episodeFields = z
  .object({ title: textSchema, onsetAt: timestampSchema, notes: notesSchema })
  .strict();
export const episodeSchema = episodeFields.extend({
  id: idSchema,
  createdAt: timestampSchema,
  resolvedAt: timestampSchema.nullable(),
});
export const observationFields = z
  .object({
    episodeId: idSchema,
    symptom: textSchema,
    severity: z.enum(['mild', 'moderate', 'severe']),
    at: timestampSchema,
    notes: notesSchema,
  })
  .strict();
export const observationSchema = observationFields.extend({ id: idSchema });
export const consultationFields = z
  .object({
    episodeId: idSchema,
    at: timestampSchema,
    notes: textSchema,
    diagnosis: z.string().trim().max(200),
    diagnosisSource: z.enum(['user-reported', 'clinician-confirmed']),
  })
  .strict();
export const consultationSchema = consultationFields.extend({ id: idSchema });
export const profileFields = z
  .object({
    allergyStatus: z.enum(['unknown', 'none-known', 'recorded']),
    allergies: z.array(textSchema).max(50),
    riskStatus: z.enum(['unknown', 'recorded']),
    riskNotes: notesSchema,
  })
  .strict()
  .refine(
    (profile) =>
      profile.allergyStatus !== 'recorded' || profile.allergies.length > 0,
    'List at least one allergy.',
  )
  .refine(
    (profile) =>
      profile.allergyStatus === 'recorded' || profile.allergies.length === 0,
    'Choose Recorded allergies to save the allergy list.',
  )
  .refine(
    (profile) =>
      profile.riskStatus !== 'recorded' || profile.riskNotes.length > 0,
    'Add the health context you reviewed.',
  );
export const profileSchema = profileFields.safeExtend({ id: idSchema });
export const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    dataset: z.enum(['personal', 'demo']),
    profile: profileSchema,
    preferences: z
      .object({ theme: z.enum(['system', 'light', 'dark']) })
      .strict(),
    medicines: z.array(medicineSchema),
    batches: z.array(batchSchema),
    regimens: z.array(regimenSchema),
    doses: z.array(doseSchema),
    episodes: z.array(episodeSchema),
    observations: z.array(observationSchema),
    consultations: z.array(consultationSchema),
    audit: z.array(
      z.object({
        id: idSchema,
        at: timestampSchema,
        action: textSchema,
        entityId: idSchema,
        reason: notesSchema.optional(),
        quantityBefore: quantitySchema.optional(),
        quantityAfter: quantitySchema.optional(),
      }),
    ),
    appliedCommands: z.array(idSchema),
  })
  .strict();

export const exportSchema = z
  .object({
    format: z.literal('medkit'),
    exportedAt: timestampSchema,
    state: stateSchema,
  })
  .strict();

export type Medicine = z.infer<typeof medicineSchema>;
export type MedicineInput = z.infer<typeof medicineFields>;
export type MedicineSnapshot = z.infer<typeof medicineSnapshotSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type Regimen = z.infer<typeof regimenSchema>;
export type Dose = z.infer<typeof doseSchema>;
export type Episode = z.infer<typeof episodeSchema>;
export type State = z.infer<typeof stateSchema>;
export type ProfileInput = z.infer<typeof profileFields>;

export function emptyState(
  profileId: string,
  dataset: State['dataset'] = 'personal',
): State {
  return {
    schemaVersion: 1,
    revision: 0,
    dataset,
    preferences: { theme: 'system' },
    profile: {
      id: profileId,
      allergyStatus: 'unknown',
      allergies: [],
      riskStatus: 'unknown',
      riskNotes: '',
    },
    medicines: [],
    batches: [],
    regimens: [],
    doses: [],
    episodes: [],
    observations: [],
    consultations: [],
    audit: [],
    appliedCommands: [],
  };
}

export function snapshot(medicine: Medicine): MedicineSnapshot {
  const { id, name, genericName, ingredients, unit, labelChecked } = medicine;
  return {
    id,
    name,
    genericName,
    ingredients: ingredients.map((item) => ({ ...item })),
    unit,
    labelChecked,
  };
}

export function localDate(at: string | Date = new Date()): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
