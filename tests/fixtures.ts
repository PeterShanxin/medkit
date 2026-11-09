import { randomUUID } from 'node:crypto';
import {
  emptyState,
  type MedicineInput,
  type State,
} from '../src/domain/model';
import { transition } from '../src/domain/transition';
import { type Command } from '../src/domain/commands';

export const now = '2026-11-09T08:00:00.000Z';
export const medicineInput: MedicineInput = {
  name: 'Example medicine',
  genericName: 'Example generic',
  aliases: ['示例药品'],
  ingredients: [{ name: 'Paracetamol', amount: 500, unit: 'mg', per: 1 }],
  form: 'Tablet',
  unit: 'tablet',
  labelChecked: true,
  classification: 'unknown',
  classificationSource: '',
  notes: 'Synthetic test record',
};
export function mutate(state: State, command: Command, at = now) {
  return transition(
    state,
    { operationId: randomUUID(), commands: [command] },
    at,
  );
}
export function fixture() {
  const medicineId = randomUUID();
  const batchId = randomUUID();
  let state = emptyState(randomUUID());
  state = mutate(state, {
    type: 'medicine.save',
    id: medicineId,
    data: medicineInput,
  });
  state = mutate(state, {
    type: 'batch.add',
    id: batchId,
    data: {
      medicineId,
      quantity: 10,
      expiresOn: '2027-01-01',
      acquiredOn: null,
      location: 'Test cupboard',
      lowStockAt: 2,
    },
  });
  const dose = (amount = 1): Extract<Command, { type: 'dose.record' }> => ({
    type: 'dose.record',
    id: randomUUID(),
    data: {
      medicineId,
      batchId,
      regimenId: null,
      episodeId: null,
      amount,
      unit: 'tablet',
      at: now,
      outcome: 'taken',
      deductStock: true,
      notes: '',
    },
  });
  return { state, medicineId, batchId, dose };
}
