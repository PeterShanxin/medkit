import { emptyState, localDate, type State } from '../domain/model';
import { transition } from '../domain/transition';
import { type Command } from '../domain/commands';

export function createDemo(
  uuid: () => string,
  now = new Date().toISOString(),
): State {
  let state = emptyState(uuid(), 'demo');
  const ago = (days: number, hours = 0) =>
    new Date(
      Date.parse(now) - days * 86_400_000 - hours * 3_600_000,
    ).toISOString();
  const later = (days: number) =>
    localDate(new Date(Date.parse(now) + days * 86_400_000));
  const apply = (command: Command, at = now) => {
    state = transition(state, { operationId: uuid(), commands: [command] }, at);
  };
  const paracetamol = uuid();
  const cetirizine = uuid();
  const saline = uuid();
  const old = uuid();
  const batch = uuid();
  const episode = uuid();
  const oldEpisode = uuid();
  const plan = uuid();
  for (const medicine of [
    {
      id: paracetamol,
      name: 'Paracetamol',
      genericName: '对乙酰氨基酚',
      ingredient: 'Paracetamol',
      amount: 500,
      form: 'Tablet',
      unit: 'tablet' as const,
    },
    {
      id: cetirizine,
      name: 'Cetirizine',
      genericName: '西替利嗪',
      ingredient: 'Cetirizine',
      amount: 10,
      form: 'Tablet',
      unit: 'tablet' as const,
    },
    {
      id: saline,
      name: 'Saline nasal spray',
      genericName: 'Sodium chloride',
      ingredient: 'Sodium chloride',
      amount: 0.9,
      form: 'Nasal spray',
      unit: 'mL' as const,
    },
    {
      id: old,
      name: 'Ibuprofen',
      genericName: '布洛芬',
      ingredient: 'Ibuprofen',
      amount: 200,
      form: 'Tablet',
      unit: 'tablet' as const,
    },
  ])
    apply(
      {
        type: 'medicine.save',
        id: medicine.id,
        data: {
          name: medicine.name,
          genericName: medicine.genericName,
          aliases: [],
          form: medicine.form,
          unit: medicine.unit,
          ingredients: [
            {
              name: medicine.ingredient,
              amount: medicine.amount,
              unit: medicine.id === saline ? '%' : 'mg',
              per: 1,
            },
          ],
          labelChecked: false,
          classification: 'unknown',
          classificationSource: '',
          notes: 'Synthetic example. Not a treatment instruction.',
        },
      },
      ago(30),
    );
  for (const data of [
    {
      id: batch,
      medicineId: paracetamol,
      quantity: 21,
      expiresOn: later(280),
      location: 'Bedroom drawer',
    },
    {
      id: uuid(),
      medicineId: paracetamol,
      quantity: 10,
      expiresOn: later(540),
      location: 'Travel pouch',
    },
    {
      id: uuid(),
      medicineId: cetirizine,
      quantity: 4,
      expiresOn: later(180),
      location: 'Bedroom drawer',
    },
    {
      id: uuid(),
      medicineId: saline,
      quantity: 30,
      expiresOn: later(100),
      location: 'Bathroom shelf',
    },
    {
      id: uuid(),
      medicineId: old,
      quantity: 8,
      expiresOn: later(-15),
      location: 'Bedroom drawer',
    },
  ])
    apply({
      type: 'batch.add',
      id: data.id,
      data: {
        medicineId: data.medicineId,
        quantity: data.quantity,
        expiresOn: data.expiresOn,
        location: data.location,
        acquiredOn: null,
        lowStockAt: 5,
      },
    });
  apply(
    {
      type: 'episode.add',
      id: oldEpisode,
      data: {
        title: 'Spring headache',
        onsetAt: ago(25),
        notes: 'Synthetic historical episode.',
      },
    },
    ago(25),
  );
  apply(
    {
      type: 'observation.add',
      id: uuid(),
      data: {
        episodeId: oldEpisode,
        symptom: 'Headache',
        severity: 'mild',
        at: ago(25),
        notes: '',
      },
    },
    ago(25),
  );
  apply({ type: 'episode.resolve', id: oldEpisode, at: ago(24) }, ago(24));
  apply(
    {
      type: 'episode.add',
      id: episode,
      data: {
        title: 'Feeling under the weather',
        onsetAt: ago(2),
        notes:
          'Resting at home. User-reported symptoms, no confirmed diagnosis.',
      },
    },
    ago(2),
  );
  apply(
    {
      type: 'observation.add',
      id: uuid(),
      data: {
        episodeId: episode,
        symptom: 'Sore throat',
        severity: 'moderate',
        at: ago(2),
        notes: '',
      },
    },
    ago(2),
  );
  apply({
    type: 'observation.add',
    id: uuid(),
    data: {
      episodeId: episode,
      symptom: 'Sore throat',
      severity: 'mild',
      at: ago(0, 3),
      notes: 'Feeling a little better today.',
    },
  });
  apply({
    type: 'regimen.add',
    id: plan,
    data: {
      medicineId: paracetamol,
      amount: 1,
      unit: 'tablet',
      instructions:
        'Example plan only. Follow your own label or clinician’s instructions.',
      kind: 'as-needed',
      times: [],
      startOn: localDate(ago(2)),
      endOn: null,
      source: 'user',
      episodeId: episode,
    },
  });
  apply({
    type: 'dose.record',
    id: uuid(),
    data: {
      medicineId: paracetamol,
      batchId: batch,
      regimenId: plan,
      episodeId: episode,
      amount: 1,
      unit: 'tablet',
      at: ago(0, 4),
      outcome: 'taken',
      notes: 'Synthetic dose record.',
      deductStock: true,
    },
  });
  return state;
}
