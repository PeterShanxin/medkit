import {
  commandSchema,
  DomainError,
  type Command,
  type Mutation,
} from './commands';
import { validateState } from './invariants';
import {
  idSchema,
  localDate,
  roundQuantity,
  snapshot,
  timestampSchema,
  type State,
} from './model';

function find<T extends { id: string }>(
  items: T[],
  id: string,
  label: string,
): T {
  const item = items.find((entry) => entry.id === id);
  if (!item)
    throw new DomainError(`${label} no longer exists. Reload your records.`);
  return item;
}

function checkTime(at: string, now: string, after?: string): void {
  if (Date.parse(at) > Date.parse(now))
    throw new DomainError('An actual event cannot be in the future.');
  if (after && Date.parse(at) < Date.parse(after))
    throw new DomainError(
      'The event cannot precede the start of this episode.',
    );
}

function availableMedicine(state: State, id: string) {
  const medicine = find(state.medicines, id, 'Medicine');
  if (medicine.archived)
    throw new DomainError(
      'Restore this medicine before using it in a new record.',
    );
  return medicine;
}

function checkEpisode(state: State, id: string | null, at?: string) {
  if (!id) return;
  const episode = find(state.episodes, id, 'Episode');
  if (at && Date.parse(at) < Date.parse(episode.onsetAt))
    throw new DomainError('The event predates this episode.');
  if (
    at &&
    episode.resolvedAt &&
    Date.parse(at) > Date.parse(episode.resolvedAt)
  )
    throw new DomainError(
      'The event is after recovery. Start a new episode for a recurrence.',
    );
}

function recordDose(
  state: State,
  command: Extract<Command, { type: 'dose.record' }>,
  now: string,
) {
  const data = command.data;
  const medicine = availableMedicine(state, data.medicineId);
  checkTime(data.at, now);
  checkEpisode(state, data.episodeId, data.at);
  if (data.unit !== medicine.unit)
    throw new DomainError(
      'The dose unit must match the medicine unit. No conversion is assumed.',
    );
  if (data.regimenId) {
    const plan = find(state.regimens, data.regimenId, 'Plan');
    if (plan.medicineId !== medicine.id)
      throw new DomainError('This plan is for a different medicine.');
    if (plan.unit !== data.unit)
      throw new DomainError('The plan uses a different unit.');
    if (
      JSON.stringify(plan.medicine.ingredients) !==
      JSON.stringify(medicine.ingredients)
    )
      throw new DomainError(
        'The formulation changed after this plan was created. Review the plan, or record the actual dose without linking this plan.',
      );
    if (data.outcome !== 'taken' && plan.kind !== 'scheduled')
      throw new DomainError(
        'Only a scheduled plan can have a skipped or missed dose.',
      );
  }
  if (data.outcome !== 'taken' && (!data.regimenId || data.deductStock))
    throw new DomainError(
      'A skipped or missed dose needs a plan and cannot reduce stock.',
    );
  if (data.batchId) {
    const batch = find(state.batches, data.batchId, 'Batch');
    if (batch.medicineId !== medicine.id)
      throw new DomainError('This batch is for a different medicine.');
    if (data.deductStock) {
      if (batch.discarded)
        throw new DomainError(
          'This batch has been discarded. Record without a stock change if the dose was already taken.',
        );
      if (batch.quantity < data.amount)
        throw new DomainError(
          'This batch has insufficient stock. Check the amount or record without a stock change.',
        );
      batch.quantity = roundQuantity(batch.quantity - data.amount);
    }
  } else if (data.deductStock)
    throw new DomainError('Choose a batch before reducing stock.');
  state.doses.push({
    ...data,
    id: command.id,
    medicine: snapshot(medicine),
    recordedAt: now,
    voidedAt: null,
    correctionReason: '',
    stockReturned: false,
  });
}

function apply(state: State, command: Command, now: string) {
  switch (command.type) {
    case 'medicine.save': {
      const existing = state.medicines.find((item) => item.id === command.id);
      if (existing) {
        if (
          existing.unit !== command.data.unit &&
          (state.batches.some((batch) => batch.medicineId === existing.id) ||
            state.regimens.some((plan) => plan.medicineId === existing.id))
        )
          throw new DomainError(
            'Create a separate medicine for a different stock unit. Existing stock and plans retain their unit.',
          );
        Object.assign(existing, command.data);
      } else
        state.medicines.push({
          ...command.data,
          id: command.id,
          archived: false,
          createdAt: now,
        });
      return;
    }
    case 'medicine.archive': {
      const medicine = find(state.medicines, command.id, 'Medicine');
      if (
        command.archived &&
        state.regimens.some(
          (plan) =>
            plan.medicineId === medicine.id &&
            ['active', 'paused'].includes(plan.status),
        )
      )
        throw new DomainError(
          'Complete or discontinue this medicine’s plans before archiving it.',
        );
      medicine.archived = command.archived;
      return;
    }
    case 'batch.add':
      availableMedicine(state, command.data.medicineId);
      if (command.data.acquiredOn && command.data.acquiredOn > localDate(now))
        throw new DomainError('The acquisition date cannot be in the future.');
      state.batches.push({
        ...command.data,
        id: command.id,
        discarded: false,
        createdAt: now,
      });
      return;
    case 'batch.update': {
      const batch = find(state.batches, command.id, 'Batch');
      if (batch.discarded)
        throw new DomainError(
          'Discarded batches stay in history. Add a new batch.',
        );
      if (command.data.acquiredOn && command.data.acquiredOn > localDate(now))
        throw new DomainError('The acquisition date cannot be in the future.');
      Object.assign(batch, command.data);
      return;
    }
    case 'batch.adjust': {
      const batch = find(state.batches, command.id, 'Batch');
      if (batch.discarded)
        throw new DomainError(
          'Add a new batch instead of changing discarded stock.',
        );
      batch.quantity = command.quantity;
      return;
    }
    case 'batch.discard':
      find(state.batches, command.id, 'Batch').discarded = true;
      return;
    case 'regimen.add': {
      const medicine = availableMedicine(state, command.data.medicineId);
      if (medicine.unit !== command.data.unit)
        throw new DomainError('The plan unit must match the medicine unit.');
      checkEpisode(state, command.data.episodeId);
      state.regimens.push({
        ...command.data,
        id: command.id,
        medicine: snapshot(medicine),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      return;
    }
    case 'regimen.status': {
      const plan = find(state.regimens, command.id, 'Plan');
      if (['completed', 'discontinued'].includes(plan.status))
        throw new DomainError(
          'A finished plan stays in history. Create a new plan to restart.',
        );
      if (command.status === 'active')
        availableMedicine(state, plan.medicineId);
      plan.status = command.status;
      plan.updatedAt = now;
      return;
    }
    case 'dose.record':
      recordDose(state, command, now);
      return;
    case 'dose.void': {
      const dose = find(state.doses, command.id, 'Dose');
      if (dose.voidedAt)
        throw new DomainError('This dose has already been corrected.');
      if (command.returnStock) {
        if (!dose.deductStock || !dose.batchId)
          throw new DomainError('This dose did not reduce stock.');
        const batch = find(state.batches, dose.batchId, 'Batch');
        if (batch.discarded)
          throw new DomainError(
            'Stock cannot return to a discarded batch. Correct the record without returning stock.',
          );
        batch.quantity = roundQuantity(batch.quantity + dose.amount);
      }
      dose.voidedAt = now;
      dose.correctionReason = command.reason;
      dose.stockReturned = command.returnStock;
      return;
    }
    case 'episode.add':
      checkTime(command.data.onsetAt, now);
      state.episodes.push({
        ...command.data,
        id: command.id,
        createdAt: now,
        resolvedAt: null,
      });
      return;
    case 'episode.resolve': {
      const episode = find(state.episodes, command.id, 'Episode');
      if (episode.resolvedAt)
        throw new DomainError('This episode is already resolved.');
      checkTime(command.at, now, episode.onsetAt);
      const relatedTimes = [
        ...state.observations,
        ...state.consultations,
        ...state.doses,
      ]
        .filter((item) => item.episodeId === episode.id)
        .map((item) => Date.parse(item.at));
      if (relatedTimes.some((at) => at > Date.parse(command.at)))
        throw new DomainError(
          'Recovery cannot precede an associated observation or dose.',
        );
      episode.resolvedAt = command.at;
      return;
    }
    case 'observation.add':
    case 'consultation.add':
      checkTime(command.data.at, now);
      checkEpisode(state, command.data.episodeId, command.data.at);
      if (command.type === 'observation.add')
        state.observations.push({ id: command.id, ...command.data });
      else state.consultations.push({ id: command.id, ...command.data });
      return;
    case 'profile.save':
      if (command.id !== state.profile.id)
        throw new DomainError('The profile does not match these records.');
      state.profile = { ...command.data, id: command.id };
      return;
    case 'preferences.save':
      if (command.id !== state.profile.id)
        throw new DomainError('The profile does not match these records.');
      state.preferences.theme = command.theme;
  }
}

export function transition(
  current: State,
  mutation: Mutation,
  now: string,
): State {
  idSchema.parse(mutation.operationId);
  timestampSchema.parse(now);
  if (current.appliedCommands.includes(mutation.operationId)) return current;
  if (mutation.commands.length < 1 || mutation.commands.length > 20)
    throw new DomainError('Submit between one and twenty related changes.');
  const state = JSON.parse(JSON.stringify(current)) as State;
  for (const raw of mutation.commands) {
    const command = commandSchema.parse(raw);
    const before =
      command.type === 'batch.adjust'
        ? find(state.batches, command.id, 'Batch').quantity
        : undefined;
    apply(state, command, now);
    state.audit.push({
      id: mutation.operationId,
      at: now,
      action: command.type,
      entityId: command.id,
      ...(command.type === 'batch.adjust'
        ? {
            reason: command.reason,
            quantityBefore: before,
            quantityAfter: command.quantity,
          }
        : {}),
    });
  }
  state.revision++;
  state.appliedCommands.push(mutation.operationId);
  return validateState(state);
}
