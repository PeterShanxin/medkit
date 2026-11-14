import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { transition } from '../src/domain/transition';
import { dateSchema, emptyState, type State } from '../src/domain/model';
import { validateState } from '../src/domain/invariants';
import {
  activeMedications,
  healthTimeline,
  inventoryAlerts,
  medicineStock,
  searchMedicines,
} from '../src/application/queries';
import {
  assessRecords,
  duplicateIngredients,
} from '../src/application/advisor';
import { createDemo } from '../src/application/demo';
import { fixture, medicineInput, mutate, now } from './fixtures';

describe('inventory and consumption', () => {
  it('creates a searchable medicine with Chinese aliases and independent batches', () => {
    const { state, medicineId } = fixture();
    const next = mutate(state, {
      type: 'batch.add',
      id: randomUUID(),
      data: {
        medicineId,
        quantity: 3,
        expiresOn: null,
        acquiredOn: null,
        location: 'Other',
        lowStockAt: 2,
      },
    });
    expect(searchMedicines(next, '示例')).toHaveLength(1);
    expect(medicineStock(next, medicineId, '2026-11-09')).toMatchObject({
      total: 13,
      available: 10,
      unknownExpiry: 3,
    });
  });
  it('deducts only explicit confirmed consumption, atomically', () => {
    const { state, dose } = fixture();
    const next = mutate(state, dose(2));
    expect(next.batches[0]!.quantity).toBe(8);
    expect(next.doses).toHaveLength(1);
    expect(state.batches[0]!.quantity).toBe(10);
    expect(() => mutate(state, dose(11))).toThrow('insufficient stock');
    expect(state.doses).toHaveLength(0);
  });
  it.each([0, -1, NaN, Infinity, 0.0001])(
    'rejects invalid dose amount %s',
    (amount) => {
      const { state, dose } = fixture();
      expect(() => mutate(state, dose(amount))).toThrow();
    },
  );
  it('rejects mismatched units and batches from another medicine', () => {
    const { state, dose } = fixture();
    const command = dose();
    command.data.unit = 'mL';
    expect(() => mutate(state, command)).toThrow('unit');
    command.data.unit = 'tablet';
    command.data.batchId = randomUUID();
    expect(() => mutate(state, command)).toThrow('Batch');
  });
  it('does not double-deduct when a confirmed mutation is retried', () => {
    const { state, dose } = fixture();
    const mutation = { operationId: randomUUID(), commands: [dose()] };
    const once = transition(state, mutation, now);
    const twice = transition(once, mutation, now);
    expect(twice.doses).toHaveLength(1);
    expect(twice.batches[0]!.quantity).toBe(9);
  });
  it('rejects duplicate record identifiers even with a different operation ID', () => {
    const { state, dose } = fixture();
    const command = dose();
    const next = mutate(state, command);
    expect(() => mutate(next, command)).toThrow('duplicate identifiers');
    expect(next.batches[0]!.quantity).toBe(9);
  });
  it('can log an already-taken dose without changing stock', () => {
    const { state, dose } = fixture();
    const command = dose();
    command.data.deductStock = false;
    command.data.batchId = null;
    expect(mutate(state, command).batches[0]!.quantity).toBe(10);
  });
  it('keeps historical name and ingredients when a catalog entry changes', () => {
    const { state, medicineId, dose } = fixture();
    const next = mutate(mutate(state, dose()), {
      type: 'medicine.save',
      id: medicineId,
      data: {
        ...medicineInput,
        name: 'Edited identity',
        ingredients: [
          { name: 'Different ingredient', amount: 20, unit: 'mg', per: 1 },
        ],
      },
    });
    expect(next.doses[0]!.medicine.name).toBe('Example medicine');
    expect(next.doses[0]!.medicine.ingredients[0]!.name).toBe('Paracetamol');
  });
  it('preserves corrections and explicitly returns stock at most once', () => {
    const { state, dose } = fixture();
    const command = dose();
    const next = mutate(state, command);
    const corrected = mutate(next, {
      type: 'dose.void',
      id: command.id,
      reason: 'Entered twice',
      returnStock: true,
    });
    expect(corrected.doses[0]!.voidedAt).toBe(now);
    expect(corrected.batches[0]!.quantity).toBe(10);
    expect(() =>
      mutate(corrected, {
        type: 'dose.void',
        id: command.id,
        reason: 'Again',
        returnStock: true,
      }),
    ).toThrow('already');
    expect(
      healthTimeline(corrected).some((event) => event.kind === 'correction'),
    ).toBe(true);
  });
  it('discards stock without erasing the batch or dose history', () => {
    const { state, batchId, medicineId, dose } = fixture();
    const next = mutate(mutate(state, dose()), {
      type: 'batch.discard',
      id: batchId,
    });
    expect(next.doses).toHaveLength(1);
    expect(next.batches).toHaveLength(1);
    expect(medicineStock(next, medicineId).total).toBe(0);
    expect(() => mutate(next, dose())).toThrow('discarded');
  });
  it('records a reason and before/after quantities for manual adjustments', () => {
    const { state, batchId } = fixture();
    const next = mutate(state, {
      type: 'batch.adjust',
      id: batchId,
      quantity: 4,
      reason: 'Recounted',
    });
    expect(next.audit.at(-1)).toMatchObject({
      reason: 'Recounted',
      quantityBefore: 10,
      quantityAfter: 4,
    });
    expect(next.doses).toHaveLength(0);
  });
  it('edits batch details without changing quantity or dose history', () => {
    const { state, batchId } = fixture();
    const next = mutate(state, {
      type: 'batch.update',
      id: batchId,
      data: {
        expiresOn: '2027-12-01',
        acquiredOn: null,
        location: 'New drawer',
        lowStockAt: 2,
      },
    });
    expect(next.batches[0]).toMatchObject({
      quantity: 10,
      location: 'New drawer',
      lowStockAt: 2,
    });
    expect(next.doses).toHaveLength(0);
    expect(() =>
      mutate(next, {
        type: 'batch.update',
        id: batchId,
        data: {
          expiresOn: null,
          acquiredOn: '2099-01-01',
          location: '',
          lowStockAt: 0,
        },
      }),
    ).toThrow('future');
  });
  it('marks expired and low stock without treating unknown expiry as available', () => {
    const { state, medicineId } = fixture();
    state.batches[0]!.expiresOn = '2026-11-08';
    state.batches[0]!.quantity = 1;
    expect(
      inventoryAlerts(state, '2026-11-09').map((item) => item.kind),
    ).toEqual(['expired', 'low-stock']);
    expect(medicineStock(state, medicineId, '2026-11-08').available).toBe(1);
    expect(medicineStock(state, medicineId, '2026-11-09').available).toBe(0);
  });
});

describe('plans and episodes', () => {
  function withPlan() {
    const { state, medicineId, dose } = fixture();
    const planId = randomUUID();
    return {
      state: mutate(state, {
        type: 'regimen.add',
        id: planId,
        data: {
          medicineId,
          amount: 1,
          unit: 'tablet',
          instructions: 'Synthetic instruction',
          kind: 'scheduled',
          times: ['08:00'],
          startOn: '2026-11-09',
          endOn: null,
          source: 'user',
          episodeId: null,
        },
      }),
      planId,
      medicineId,
      dose,
    };
  }
  it('does not consume medication when creating, pausing, or completing a plan', () => {
    const { state, planId } = withPlan();
    expect(state.doses).toHaveLength(0);
    expect(state.batches[0]!.quantity).toBe(10);
    const paused = mutate(state, {
      type: 'regimen.status',
      id: planId,
      status: 'paused',
    });
    expect(activeMedications(paused)).toHaveLength(0);
    const completed = mutate(paused, {
      type: 'regimen.status',
      id: planId,
      status: 'completed',
    });
    expect(() =>
      mutate(completed, {
        type: 'regimen.status',
        id: planId,
        status: 'active',
      }),
    ).toThrow('finished');
  });
  it('records skipped and missed outcomes without stock deductions', () => {
    const { state, planId, dose } = withPlan();
    const command = dose();
    command.data.regimenId = planId;
    command.data.outcome = 'skipped';
    expect(() => mutate(state, command)).toThrow('cannot reduce');
    command.data.deductStock = false;
    const next = mutate(state, command);
    expect(next.batches[0]!.quantity).toBe(10);
    expect(next.doses[0]!.outcome).toBe('skipped');
  });
  it('requires a formulation review when an existing plan and medicine diverge', () => {
    const { state, medicineId, planId, dose } = withPlan();
    const changed = mutate(state, {
      type: 'medicine.save',
      id: medicineId,
      data: {
        ...medicineInput,
        ingredients: [{ name: 'Paracetamol', amount: 250, unit: 'mg', per: 1 }],
      },
    });
    const command = dose();
    command.data.regimenId = planId;
    expect(() => mutate(changed, command)).toThrow('formulation changed');
    expect(
      assessRecords(changed, now).findings.some(
        (finding) => finding.code === 'changed-plan-formulation',
      ),
    ).toBe(true);
    expect(changed.doses).toHaveLength(0);
  });
  it('does not create missed doses for as-needed plans', () => {
    const { state, planId, dose } = withPlan();
    state.regimens[0]!.kind = 'as-needed';
    state.regimens[0]!.times = [];
    const command = dose();
    command.data.regimenId = planId;
    command.data.outcome = 'missed';
    command.data.deductStock = false;
    expect(() => mutate(state, command)).toThrow('scheduled plan');
  });
  it('requires active plans to finish before archiving medicine', () => {
    const { state, medicineId } = withPlan();
    expect(() =>
      mutate(state, {
        type: 'medicine.archive',
        id: medicineId,
        archived: true,
      }),
    ).toThrow('plans');
  });
  it('tracks overlapping episodes and recovery independently', () => {
    let state = emptyState(randomUUID());
    const a = randomUUID();
    const b = randomUUID();
    for (const id of [a, b])
      state = mutate(state, {
        type: 'episode.add',
        id,
        data: {
          title: 'Synthetic episode',
          onsetAt: '2026-11-08T08:00:00.000Z',
          notes: '',
        },
      });
    state = mutate(state, {
      type: 'observation.add',
      id: randomUUID(),
      data: {
        episodeId: a,
        symptom: 'Example symptom',
        severity: 'mild',
        at: now,
        notes: '',
      },
    });
    state = mutate(state, { type: 'episode.resolve', id: a, at: now });
    expect(
      state.episodes.filter((episode) => !episode.resolvedAt),
    ).toHaveLength(1);
    expect(healthTimeline(state, a)).toHaveLength(3);
    expect(() =>
      mutate(
        state,
        {
          type: 'observation.add',
          id: randomUUID(),
          data: {
            episodeId: a,
            symptom: 'Recurrence',
            severity: 'mild',
            at: '2026-11-09T09:00:00.000Z',
            notes: '',
          },
        },
        '2026-11-09T10:00:00.000Z',
      ),
    ).toThrow('after recovery');
  });
  it('rejects invalid calendar dates and future actual events', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    const { state, dose } = fixture();
    const command = dose();
    command.data.at = '2030-01-01T00:00:00.000Z';
    expect(() => mutate(state, command)).toThrow('future');
  });
  it('rejects unsupported schema versions and orphan references', () => {
    const { state } = fixture();
    expect(() => validateState({ ...state, schemaVersion: 2 })).toThrow();
    expect(() => validateState({ ...state, medicines: [] })).toThrow(
      'reference',
    );
  });
  it('rejects inconsistent historical snapshots and correction metadata from storage', () => {
    const { state, dose } = fixture();
    const saved = mutate(state, dose());
    saved.doses[0]!.medicine.id = randomUUID();
    expect(() => validateState(saved)).toThrow('historical record');
    saved.doses[0]!.medicine.id = saved.doses[0]!.medicineId;
    saved.doses[0]!.stockReturned = true;
    expect(() => validateState(saved)).toThrow('correction');
  });
});

describe('safe informational checks', () => {
  it('finds combination-medicine overlap and acetaminophen aliases', () => {
    const { state } = fixture();
    const medicine = state.medicines[0]!;
    const combination = {
      ...medicine,
      id: randomUUID(),
      name: 'Example combination',
      ingredients: [
        { name: 'Acetaminophen', amount: 500, unit: 'mg' as const, per: 1 },
        { name: 'Other ingredient', amount: 2, unit: 'mg' as const, per: 1 },
      ],
    };
    expect(duplicateIngredients([medicine, combination])).toHaveLength(1);
  });
  it('abstains even when no obvious record conflicts exist', () => {
    const { state } = fixture();
    const assessment = assessRecords(state, now);
    expect(assessment.outcome).toBe('abstain');
    expect(assessment.findings.map((item) => item.code)).toContain(
      'unknown-allergies',
    );
    expect(assessment.limitations.join(' ')).toContain('does not mean');
  });
  it('does not hide uncertainty behind label confirmation', () => {
    const { state } = fixture();
    state.medicines[0]!.labelChecked = false;
    expect(
      assessRecords(state, now).findings.some(
        (item) => item.code === 'unverified-label',
      ),
    ).toBe(true);
    expect(assessRecords(state, now, true).outcome).toBe('seek-help');
  });
  it('keeps synthetic demo records separate and internally valid', () => {
    const demo: State = createDemo(randomUUID, now);
    expect(validateState(demo).dataset).toBe('demo');
    expect(demo.medicines).toHaveLength(4);
    expect(emptyState(randomUUID()).medicines).toHaveLength(0);
  });
});
