import { DomainError } from './commands';
import { type State, stateSchema } from './model';

export function validateState(value: unknown): State {
  const state = stateSchema.parse(value);
  const lists = [
    state.medicines,
    state.batches,
    state.regimens,
    state.doses,
    state.episodes,
    state.observations,
    state.consultations,
  ];
  const allIds = lists.flatMap((list) => list.map((item) => item.id));
  if (new Set(allIds).size !== allIds.length)
    throw new DomainError('The records contain duplicate identifiers.');
  const medicineIds = new Set(state.medicines.map((item) => item.id));
  const episodeIds = new Set(state.episodes.map((item) => item.id));
  for (const item of [...state.batches, ...state.regimens, ...state.doses]) {
    if (!medicineIds.has(item.medicineId))
      throw new DomainError('A medicine reference is missing.');
  }
  for (const item of [
    ...state.regimens,
    ...state.doses,
    ...state.observations,
    ...state.consultations,
  ]) {
    if (item.episodeId && !episodeIds.has(item.episodeId))
      throw new DomainError('An episode reference is missing.');
  }
  for (const dose of state.doses) {
    if (
      dose.medicine.id !== dose.medicineId ||
      Date.parse(dose.at) > Date.parse(dose.recordedAt)
    )
      throw new DomainError('A dose has an inconsistent historical record.');
    if (
      (dose.voidedAt === null &&
        (dose.stockReturned || dose.correctionReason !== '')) ||
      (dose.voidedAt !== null &&
        (!dose.correctionReason ||
          Date.parse(dose.voidedAt) < Date.parse(dose.recordedAt))) ||
      (dose.stockReturned && !dose.deductStock)
    )
      throw new DomainError('A dose correction has inconsistent metadata.');
    if (
      dose.batchId &&
      !state.batches.some(
        (batch) =>
          batch.id === dose.batchId && batch.medicineId === dose.medicineId,
      )
    )
      throw new DomainError('A dose has an invalid batch reference.');
    if (
      dose.regimenId &&
      !state.regimens.some(
        (plan) =>
          plan.id === dose.regimenId && plan.medicineId === dose.medicineId,
      )
    )
      throw new DomainError('A dose has an invalid plan reference.');
    if (dose.unit !== dose.medicine.unit)
      throw new DomainError(
        'A dose unit does not match its historical record.',
      );
    if (dose.deductStock && (dose.outcome !== 'taken' || !dose.batchId))
      throw new DomainError(
        'Only a confirmed dose from a batch can reduce stock.',
      );
    if (
      dose.outcome !== 'taken' &&
      !state.regimens.some(
        (plan) => plan.id === dose.regimenId && plan.kind === 'scheduled',
      )
    )
      throw new DomainError('A missed or skipped dose needs a scheduled plan.');
  }
  for (const plan of state.regimens) {
    if (
      plan.medicine.id !== plan.medicineId ||
      plan.unit !== plan.medicine.unit
    )
      throw new DomainError('A plan has an inconsistent historical record.');
  }
  for (const episode of state.episodes) {
    if (
      Date.parse(episode.onsetAt) > Date.parse(episode.createdAt) ||
      (episode.resolvedAt &&
        Date.parse(episode.resolvedAt) < Date.parse(episode.onsetAt))
    )
      throw new DomainError('An episode has inconsistent dates.');
  }
  for (const event of [
    ...state.observations,
    ...state.consultations,
    ...state.doses,
  ]) {
    const episode = state.episodes.find((item) => item.id === event.episodeId);
    if (
      episode &&
      (Date.parse(event.at) < Date.parse(episode.onsetAt) ||
        (episode.resolvedAt &&
          Date.parse(event.at) > Date.parse(episode.resolvedAt)))
    )
      throw new DomainError('A historical event falls outside its episode.');
  }
  return state;
}
