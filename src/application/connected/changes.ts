import type { Command } from '../../domain/commands';
import type { State } from '../../domain/model';
import type { Change } from './contracts';

export function changeCommands(change: Change, id: () => string): Command[] {
  switch (change.kind) {
    case 'add_medicine': {
      const medicineId = id();
      // Extracted labels remain unverified even when a model claims verification.
      return [
        {
          type: 'medicine.save',
          id: medicineId,
          data: {
            ...change.medicine,
            labelChecked: false,
            classification: 'unknown',
            classificationSource: '',
          },
        },
        { type: 'batch.add', id: id(), data: { ...change.batch, medicineId } },
      ];
    }
    case 'add_batch':
      return [{ type: 'batch.add', id: id(), data: change.batch }];
    case 'record_dose':
      return [{ type: 'dose.record', id: id(), data: change.dose }];
    case 'start_episode': {
      const episodeId = id();
      return [
        { type: 'episode.add', id: episodeId, data: change.episode },
        ...change.symptoms.map((data): Command => ({
          type: 'observation.add',
          id: id(),
          data: { ...data, episodeId },
        })),
      ];
    }
    case 'record_symptom':
      return [{ type: 'observation.add', id: id(), data: change.observation }];
    case 'resolve_episode':
      return [{ type: 'episode.resolve', id: change.episodeId, at: change.at }];
    case 'adjust_stock':
      return [
        {
          type: 'batch.adjust',
          id: change.batchId,
          quantity: change.quantity,
          reason: change.reason,
        },
      ];
    case 'void_dose':
      return [
        {
          type: 'dose.void',
          id: change.doseId,
          reason: change.reason,
          returnStock: change.returnStock,
        },
      ];
  }
}

export function describeChange(change: Change, state: State) {
  const details: { label: string; value: string }[] = [];
  const add = (label: string, value: unknown) =>
    details.push({ label, value: String(value ?? 'Not recorded') });
  const medicine = (id: string) => state.medicines.find((m) => m.id === id);
  const batch = (id: string) => state.batches.find((b) => b.id === id);
  const medicineDetails = (id: string) => {
    const m = medicine(id);
    add('Medicine', m?.name);
    add(
      'Ingredients',
      m?.ingredients
        .map(
          (i) =>
            `${i.name} ${i.amount ?? 'Unknown'} ${i.unit} per ${i.per} ${m.unit}`,
        )
        .join('; ') || 'Not recorded',
    );
  };
  const batchDetails = (id: string) => {
    const b = batch(id);
    add('Storage location', b?.location || 'Not recorded');
    add('Expiry', b?.expiresOn);
    if (b?.acquiredOn) add('Acquired on', b.acquiredOn);
  };
  const symptom = (s: {
    symptom: string;
    severity: string;
    at: string;
    notes: string;
  }) => {
    add('Symptom', s.symptom);
    add('Severity', s.severity);
    add('Observed at', s.at);
    add('Notes', s.notes || 'None');
  };
  switch (change.kind) {
    case 'add_medicine': {
      const m = change.medicine;
      add('Medicine', m.name);
      add('Generic name', m.genericName || 'Not recorded');
      add('Other names', m.aliases.join(', ') || 'None');
      add(
        'Ingredients',
        m.ingredients
          .map(
            (i) =>
              `${i.name} ${i.amount ?? 'Unknown'} ${i.unit} per ${i.per} ${m.unit}`,
          )
          .join('; ') || 'Not recorded',
      );
      add('Form', m.form);
      add('Quantity', `${change.batch.quantity} ${m.unit}`);
      add('Expiry', change.batch.expiresOn);
      add('Acquired on', change.batch.acquiredOn);
      add('Storage location', change.batch.location || 'Not recorded');
      add('Low stock at', change.batch.lowStockAt);
      add('Notes', m.notes || 'None');
      add(
        'Verification',
        'Label and OTC/prescription classification remain unverified.',
      );
      return { title: 'Add medicine', details };
    }
    case 'add_batch':
      medicineDetails(change.batch.medicineId);
      add(
        'Quantity',
        `${change.batch.quantity} ${medicine(change.batch.medicineId)?.unit}`,
      );
      add('Expiry', change.batch.expiresOn);
      add('Acquired on', change.batch.acquiredOn);
      add('Storage location', change.batch.location || 'Not recorded');
      add('Low stock at', change.batch.lowStockAt);
      return { title: 'Add stock', details };
    case 'record_dose': {
      const d = change.dose;
      medicineDetails(d.medicineId);
      add('Amount', `${d.amount} ${d.unit}`);
      add('Event time', d.at);
      add('Outcome', d.outcome);
      if (d.batchId) batchDetails(d.batchId);
      add(
        'Stock change',
        d.deductStock
          ? `${batch(d.batchId!)?.quantity} → ${(batch(d.batchId!)?.quantity ?? 0) - d.amount} ${d.unit}`
          : 'No stock deduction',
      );
      add(
        'Episode',
        state.episodes.find((e) => e.id === d.episodeId)?.title ?? 'None',
      );
      add(
        'Plan',
        state.regimens.find((r) => r.id === d.regimenId)?.instructions ??
          'None',
      );
      add('Notes', d.notes || 'None');
      return {
        title:
          d.outcome === 'taken'
            ? 'Record actual dose'
            : d.outcome === 'skipped'
              ? 'Record skipped dose'
              : 'Record missed dose',
        details,
      };
    }
    case 'start_episode':
      add('Episode', change.episode.title);
      add('Started at', change.episode.onsetAt);
      add('Notes', change.episode.notes || 'None');
      change.symptoms.forEach(symptom);
      return { title: 'Start health episode', details };
    case 'record_symptom':
      add(
        'Episode',
        state.episodes.find((e) => e.id === change.observation.episodeId)
          ?.title,
      );
      symptom(change.observation);
      return { title: 'Record symptom', details };
    case 'resolve_episode':
      add(
        'Episode',
        state.episodes.find((e) => e.id === change.episodeId)?.title,
      );
      add('Recovered at', change.at);
      add('Medication plans', 'No plans will be stopped.');
      return { title: 'Record recovery', details };
    case 'adjust_stock': {
      const b = batch(change.batchId)!;
      medicineDetails(b.medicineId);
      batchDetails(b.id);
      add(
        'Stock change',
        `${b.quantity} → ${change.quantity} ${medicine(b.medicineId)?.unit}`,
      );
      add('Reason', change.reason);
      return { title: 'Adjust stock', details };
    }
    case 'void_dose': {
      const d = state.doses.find((d) => d.id === change.doseId)!;
      add('Medicine', d.medicine.name);
      add('Original dose', `${d.amount} ${d.unit} at ${d.at}`);
      add('Reason', change.reason);
      add(
        'Stock change',
        change.returnStock
          ? `Return ${d.amount} ${d.unit} to the original batch`
          : 'Do not return stock',
      );
      add('History', 'The original dose stays visible as corrected.');
      return { title: 'Correct dose record', details };
    }
  }
}
