import { localDate, type MedicineSnapshot, type State } from '../domain/model';
import { inventoryAlerts, medicineStock } from './queries';

export interface Finding {
  code: string;
  level: 'attention' | 'unknown' | 'information';
  title: string;
  detail: string;
  medicineIds: string[];
}

// These are naming aliases, not interaction or dose rules.
export function ingredientKey(name: string): string {
  const key = name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
  return ['acetaminophen', '对乙酰氨基酚', '扑热息痛'].includes(key)
    ? 'paracetamol'
    : key;
}

export function duplicateIngredients(medicines: MedicineSnapshot[]): Finding[] {
  const groups = new Map<
    string,
    { name: string; ids: Set<string>; names: Set<string> }
  >();
  for (const medicine of medicines)
    for (const ingredient of medicine.ingredients) {
      const key = ingredientKey(ingredient.name);
      const group = groups.get(key) ?? {
        name: ingredient.name,
        ids: new Set<string>(),
        names: new Set<string>(),
      };
      group.ids.add(medicine.id);
      group.names.add(medicine.name);
      groups.set(key, group);
    }
  return [...groups.values()]
    .filter((group) => group.ids.size > 1)
    .map((group) => ({
      code: 'duplicate-ingredient',
      level: 'attention',
      title: `Shared ingredient: ${group.name}`,
      detail: `${[...group.names].join(' and ')} list the same ingredient. Ownership does not mean these were taken together. Check with a pharmacist before combining medicines.`,
      medicineIds: [...group.ids],
    }));
}

export interface Assessment {
  outcome: 'abstain' | 'seek-help';
  headline: string;
  findings: Finding[];
  limitations: string[];
  checkedAt: string;
}

export function assessRecords(
  state: State,
  now = new Date().toISOString(),
  urgentSymptoms = false,
): Assessment {
  const medicines = state.medicines.filter((medicine) => !medicine.archived);
  const available = medicines.filter(
    (medicine) => medicineStock(state, medicine.id, localDate(now)).total > 0,
  );
  const findings: Finding[] = duplicateIngredients(available);
  for (const alert of inventoryAlerts(state, localDate(now))) {
    findings.push({
      code: alert.kind,
      level: alert.kind === 'expired' ? 'attention' : 'unknown',
      title: `${alert.medicineName}: ${alert.detail}`,
      detail:
        alert.kind === 'expired'
          ? 'Keep expired stock separate. Ask a pharmacist about disposal or replacement.'
          : 'Check the package and update this batch.',
      medicineIds: [alert.medicineId],
    });
  }
  for (const medicine of available) {
    if (
      !medicine.labelChecked ||
      medicine.ingredients.length === 0 ||
      medicine.ingredients.some((item) => item.amount === null)
    )
      findings.push({
        code: 'unverified-label',
        level: 'unknown',
        title: `Check ${medicine.name}`,
        detail:
          'The ingredients or strength have not been checked against the package. No dose or suitability assessment is available.',
        medicineIds: [medicine.id],
      });
  }
  if (state.profile.allergyStatus === 'unknown')
    findings.push({
      code: 'unknown-allergies',
      level: 'unknown',
      title: 'Allergy history is missing',
      detail:
        'Add your known allergies, or explicitly record that none are known.',
      medicineIds: [],
    });
  if (state.profile.allergyStatus === 'recorded')
    findings.push({
      code: 'allergies-not-screened',
      level: 'attention',
      title: 'Allergies need professional review',
      detail:
        'Your recorded allergies are included in the consultation summary. This app cannot rule out an allergic reaction.',
      medicineIds: [],
    });
  if (state.profile.riskStatus === 'unknown')
    findings.push({
      code: 'unknown-context',
      level: 'unknown',
      title: 'Personal safety context is missing',
      detail:
        'Relevant conditions, pregnancy or breastfeeding, age concerns, and other medicines may change what is suitable.',
      medicineIds: [],
    });
  for (const plan of state.regimens.filter(
    (item) => item.status === 'active',
  )) {
    const medicine = state.medicines.find(
      (item) => item.id === plan.medicineId,
    );
    if (
      medicine &&
      JSON.stringify(plan.medicine.ingredients) !==
        JSON.stringify(medicine.ingredients)
    )
      findings.push({
        code: 'changed-plan-formulation',
        level: 'attention',
        title: `Review the plan for ${medicine.name}`,
        detail:
          'The recorded ingredients or strength changed after this plan was created. Its instructions may refer to a different formulation.',
        medicineIds: [medicine.id],
      });
  }
  const recent = state.doses.filter(
    (dose) =>
      !dose.voidedAt &&
      dose.outcome === 'taken' &&
      Date.parse(dose.at) <= Date.parse(now) &&
      Date.parse(dose.at) >= Date.parse(now) - 24 * 60 * 60 * 1000,
  );
  const overlaps = duplicateIngredients(recent.map((dose) => dose.medicine));
  for (const overlap of overlaps)
    findings.push({
      ...overlap,
      code: 'recent-overlap',
      title: `Recorded within 24 hours: ${overlap.title.replace('Shared ingredient: ', '')}`,
      detail:
        'Different medicines with this ingredient have recorded doses in the last 24 hours. This is a record review window, not a safe dosing interval or overdose assessment. Review the amounts and times with a pharmacist.',
    });
  return {
    outcome: urgentSymptoms ? 'seek-help' : 'abstain',
    headline: urgentSymptoms
      ? 'Seek urgent medical help now.'
      : 'Your records are ready to review.',
    findings,
    limitations: [
      'MedKit cannot determine which medicine is suitable for your symptoms.',
      'Interaction, contraindication, and dosage screening are not available.',
      'No findings does not mean a medicine is safe. Records and ingredient matching may be incomplete.',
    ],
    checkedAt: now,
  };
}
