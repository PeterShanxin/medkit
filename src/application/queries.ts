import {
  localDate,
  roundQuantity,
  type Medicine,
  type State,
} from '../domain/model';

export function medicineStock(
  state: State,
  medicineId: string,
  today = localDate(),
) {
  const batches = state.batches.filter(
    (batch) => batch.medicineId === medicineId && !batch.discarded,
  );
  return {
    available: roundQuantity(
      batches
        .filter((batch) => batch.expiresOn && batch.expiresOn >= today)
        .reduce((sum, batch) => sum + batch.quantity, 0),
    ),
    unknownExpiry: roundQuantity(
      batches
        .filter((batch) => !batch.expiresOn)
        .reduce((sum, batch) => sum + batch.quantity, 0),
    ),
    expired: roundQuantity(
      batches
        .filter((batch) => batch.expiresOn && batch.expiresOn < today)
        .reduce((sum, batch) => sum + batch.quantity, 0),
    ),
    total: roundQuantity(
      batches.reduce((sum, batch) => sum + batch.quantity, 0),
    ),
  };
}

export function searchMedicines(
  state: State,
  query = '',
  includeArchived = false,
): Medicine[] {
  const term = query.trim().toLocaleLowerCase();
  return state.medicines.filter(
    (medicine) =>
      (includeArchived || !medicine.archived) &&
      [
        medicine.name,
        medicine.genericName,
        ...medicine.aliases,
        ...medicine.ingredients.map((item) => item.name),
      ].some((value) => value.toLocaleLowerCase().includes(term)),
  );
}

export function cabinetRecords(state: State, query = '') {
  return searchMedicines(state, query).map((medicine) => ({
    ...medicine,
    inventory: medicineStock(state, medicine.id),
    batches: state.batches.filter(
      (batch) => batch.medicineId === medicine.id && !batch.discarded,
    ),
  }));
}

export function inventoryAlerts(state: State, today = localDate()) {
  return state.batches
    .filter(
      (batch) =>
        !batch.discarded &&
        !state.medicines.find((medicine) => medicine.id === batch.medicineId)
          ?.archived,
    )
    .flatMap((batch) => {
      const medicine = state.medicines.find(
        (item) => item.id === batch.medicineId,
      )!;
      const base = {
        batchId: batch.id,
        medicineId: medicine.id,
        medicineName: medicine.name,
        quantity: batch.quantity,
        unit: medicine.unit,
      };
      const alerts: (typeof base & {
        kind: 'expired' | 'low-stock' | 'unknown-expiry';
        detail: string;
      })[] = [];
      if (batch.quantity > 0 && batch.expiresOn && batch.expiresOn < today)
        alerts.push({
          ...base,
          kind: 'expired',
          detail: `Expired ${batch.expiresOn}`,
        });
      else if (batch.quantity > 0 && !batch.expiresOn)
        alerts.push({
          ...base,
          kind: 'unknown-expiry',
          detail: 'Expiry date not recorded',
        });
      if (batch.quantity <= batch.lowStockAt)
        alerts.push({
          ...base,
          kind: 'low-stock',
          detail: `${batch.quantity} ${medicine.unit} remaining`,
        });
      return alerts;
    });
}

export function activeMedications(state: State, today = localDate()) {
  return state.regimens.filter(
    (plan) =>
      plan.status === 'active' &&
      plan.startOn <= today &&
      (!plan.endOn || plan.endOn >= today),
  );
}

export function recentDoses(state: State, limit = 30) {
  return [...state.doses]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export interface TimelineEntry {
  id: string;
  kind:
    | 'episode'
    | 'recovery'
    | 'symptom'
    | 'consultation'
    | 'dose'
    | 'correction'
    | 'plan';
  at: string;
  title: string;
  detail: string;
  episodeId: string | null;
  doseId?: string;
}

export function healthTimeline(
  state: State,
  episodeId?: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const episode of state.episodes) {
    entries.push({
      id: episode.id,
      kind: 'episode',
      at: episode.onsetAt,
      title: episode.title,
      detail: 'Episode started',
      episodeId: episode.id,
    });
    if (episode.resolvedAt)
      entries.push({
        id: `${episode.id}-resolved`,
        kind: 'recovery',
        at: episode.resolvedAt,
        title: episode.title,
        detail: 'Marked recovered',
        episodeId: episode.id,
      });
  }
  for (const observation of state.observations)
    entries.push({
      id: observation.id,
      kind: 'symptom',
      at: observation.at,
      title: observation.symptom,
      detail: `${observation.severity}${observation.notes ? ` · ${observation.notes}` : ''}`,
      episodeId: observation.episodeId,
    });
  for (const consultation of state.consultations)
    entries.push({
      id: consultation.id,
      kind: 'consultation',
      at: consultation.at,
      title: 'Consultation',
      detail: `${consultation.notes}${consultation.diagnosis ? ` · ${consultation.diagnosis} (${consultation.diagnosisSource})` : ''}`,
      episodeId: consultation.episodeId,
    });
  for (const dose of state.doses) {
    entries.push({
      id: dose.id,
      kind: 'dose',
      at: dose.at,
      title: dose.medicine.name,
      detail: `${dose.amount} ${dose.unit} · ${dose.outcome}${dose.voidedAt ? ' · corrected' : ''}${dose.notes ? ` · ${dose.notes}` : ''}`,
      episodeId: dose.episodeId,
      doseId: dose.id,
    });
    if (dose.voidedAt)
      entries.push({
        id: `${dose.id}-correction`,
        kind: 'correction',
        at: dose.voidedAt,
        title: `Correction: ${dose.medicine.name}`,
        detail: `${dose.correctionReason}${dose.stockReturned ? ' · stock returned' : ' · stock unchanged'}`,
        episodeId: dose.episodeId,
      });
  }
  for (const plan of state.regimens)
    entries.push({
      id: plan.id,
      kind: 'plan',
      at: plan.createdAt,
      title: plan.medicine.name,
      detail: `Plan recorded · ${plan.instructions}`,
      episodeId: plan.episodeId,
    });
  return entries
    .filter((entry) => !episodeId || entry.episodeId === episodeId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function medicationContext(
  state: State,
  now = new Date().toISOString(),
) {
  const cutoff = Date.parse(now) - 7 * 24 * 60 * 60 * 1000;
  return {
    asOf: now,
    dataset: state.dataset,
    safetyContext: state.profile,
    activePlans: activeMedications(state, localDate(now)),
    recentDoses: recentDoses(state, state.doses.length).filter(
      (dose) => Date.parse(dose.at) >= cutoff,
    ),
    activeEpisodes: state.episodes.filter((episode) => !episode.resolvedAt),
    alerts: inventoryAlerts(state, localDate(now)),
    limitations: [
      'Records may be incomplete.',
      'A plan is not evidence of a dose taken.',
      'These records do not establish medicine safety.',
    ],
  };
}

export function consultationSummary(
  state: State,
  now = new Date().toISOString(),
): string {
  const context = medicationContext(state, now);
  const allergies =
    state.profile.allergyStatus === 'recorded'
      ? state.profile.allergies.join(', ')
      : state.profile.allergyStatus === 'none-known'
        ? 'None known (user reported)'
        : 'Not recorded';
  return [
    `MedKit consultation summary${state.dataset === 'demo' ? ' - SYNTHETIC DEMO' : ''}`,
    `Prepared: ${new Date(now).toLocaleString()}`,
    `Allergies: ${allergies}`,
    `Health context: ${state.profile.riskStatus === 'recorded' ? state.profile.riskNotes : 'Not recorded'}`,
    '',
    'ACTIVE PLANS (instructions, not proof of consumption)',
    ...context.activePlans.map(
      (plan) =>
        `${plan.medicine.name} · ${plan.amount} ${plan.unit} · ${plan.instructions} · ${plan.source}`,
    ),
    ...(context.activePlans.length ? [] : ['None recorded.']),
    '',
    'DOSE RECORDS - LAST 7 DAYS',
    ...context.recentDoses.map(
      (dose) =>
        `${new Date(dose.at).toLocaleString()} · ${dose.medicine.name} · ${dose.amount} ${dose.unit} · ${dose.outcome}${dose.voidedAt ? ' · VOIDED' : ''}${dose.notes ? ` · ${dose.notes}` : ''}`,
    ),
    ...(context.recentDoses.length ? [] : ['None recorded.']),
    '',
    'HEALTH EPISODES',
    ...state.episodes.map(
      (episode) =>
        `${episode.title} · ${episode.onsetAt.slice(0, 10)} · ${episode.resolvedAt ? `recovered ${episode.resolvedAt.slice(0, 10)}` : 'active'}${episode.notes ? ` · ${episode.notes}` : ''}`,
    ),
    ...state.observations.map(
      (item) =>
        `${new Date(item.at).toLocaleString()} · ${item.symptom} · ${item.severity}${item.notes ? ` · ${item.notes}` : ''}`,
    ),
    ...state.consultations.map(
      (item) =>
        `${new Date(item.at).toLocaleString()} · Consultation: ${item.notes}${item.diagnosis ? ` · ${item.diagnosis} (${item.diagnosisSource})` : ''}`,
    ),
    '',
    'User-maintained records. Missing information does not mean no risk. Review with your clinician.',
  ].join('\n');
}
