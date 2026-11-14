import { useState } from 'react';
import { type Dose, type Regimen, localDate } from '../../domain/model';
import { Choice, Copy, Field, FormDialog, Notice, Toggle } from '../components';
import { useRecords, uuid } from '../store';
import {
  formatDateTimeInput,
  parseDateTimeInput,
  tryDateTime,
} from '../format';

export function DoseForm({
  medicineId,
  plan,
  onClose,
}: {
  medicineId?: string;
  plan?: Regimen;
  onClose(): void;
}) {
  const { state, run } = useRecords();
  const medicines = state!.medicines.filter((item) => !item.archived);
  const initialId = plan?.medicineId ?? medicineId ?? medicines[0]?.id ?? '';
  const batchesFor = (id: string) =>
    state!.batches
      .filter((batch) => batch.medicineId === id && !batch.discarded)
      .sort((a, b) =>
        (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'),
      );
  const initialBatch = batchesFor(initialId).find(
    (batch) =>
      batch.quantity > 0 && batch.expiresOn && batch.expiresOn >= localDate(),
  );
  const [selected, setSelected] = useState(initialId);
  const [batchId, setBatch] = useState(initialBatch?.id ?? '');
  const [amount, setAmount] = useState(plan?.amount.toString() ?? '');
  const [deduct, setDeduct] = useState(!!initialBatch);
  const [at, setAt] = useState(formatDateTimeInput());
  const [outcome, setOutcome] = useState<Dose['outcome']>('taken');
  const [episodeId, setEpisode] = useState(plan?.episodeId ?? '');
  const [notes, setNotes] = useState('');
  const medicine = medicines.find((item) => item.id === selected);
  const batch = state!.batches.find((item) => item.id === batchId);
  return (
    <FormDialog
      title="Record a dose"
      submitLabel={
        outcome === 'taken' ? 'Confirm dose taken' : `Record ${outcome} dose`
      }
      onClose={onClose}
      onSubmit={async (operationId) => {
        if (!medicine) throw new Error('Choose a medicine.');
        await run(
          [
            {
              type: 'dose.record',
              id: uuid(),
              data: {
                medicineId: medicine.id,
                batchId: batchId || null,
                regimenId: plan?.id ?? null,
                episodeId: episodeId || null,
                amount: Number(amount),
                unit: medicine.unit,
                at: parseDateTimeInput(at),
                outcome,
                notes,
                deductStock: outcome === 'taken' && deduct,
              },
            },
          ],
          operationId,
        );
      }}
    >
      {plan ? (
        <Copy size={21} weight="medium">
          {plan.medicine.name}
        </Copy>
      ) : (
        <Choice
          label="Medicine"
          value={selected}
          options={medicines.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          onChange={(value) => {
            setSelected(value);
            setBatch('');
            setDeduct(false);
            setAmount('');
          }}
        />
      )}
      <Field
        label={`Amount (${medicine?.unit ?? 'unit'})`}
        value={amount}
        onChange={setAmount}
        keyboard="decimal-pad"
        placeholder="Amount actually taken"
      />
      {plan?.kind === 'scheduled' && (
        <Choice
          label="Dose outcome"
          value={outcome}
          onChange={(value) => setOutcome(value as Dose['outcome'])}
          options={['taken', 'skipped', 'missed'].map((value) => ({
            value,
            label: value[0]!.toUpperCase() + value.slice(1),
          }))}
        />
      )}
      <Field
        label="When (local time)"
        value={at}
        onChange={setAt}
        placeholder="YYYY-MM-DD HH:mm"
      />
      {outcome === 'taken' && (
        <>
          <Choice
            label="Inventory batch"
            value={batchId}
            onChange={(value) => {
              setBatch(value);
              setDeduct(!!value);
            }}
            options={[
              { value: '', label: 'No batch / stock unchanged' },
              ...batchesFor(selected).map((item) => ({
                value: item.id,
                label: `${item.location || 'Unspecified location'} · ${item.quantity} ${medicine?.unit} · ${item.expiresOn ? `expires ${item.expiresOn}` : 'expiry unknown'}`,
              })),
            ]}
          />
          {batch?.expiresOn &&
            tryDateTime(at) &&
            batch.expiresOn < localDate(tryDateTime(at)!) && (
              <Notice>
                This batch was expired at the entered time. This form records
                what already happened; it does not recommend taking it.
              </Notice>
            )}
          {batchId && (
            <Toggle
              label="Deduct this amount from the selected batch"
              value={deduct}
              onChange={setDeduct}
            />
          )}
        </>
      )}
      <Choice
        label="Related episode"
        value={episodeId}
        onChange={setEpisode}
        options={[
          { value: '', label: 'No episode' },
          ...state!.episodes.map((episode) => ({
            value: episode.id,
            label: `${episode.title}${episode.resolvedAt ? ' (resolved)' : ''}`,
          })),
        ]}
      />
      <Field
        label="Notes, effects, or side effects (optional)"
        value={notes}
        onChange={setNotes}
        multiline
      />
      <Copy muted size={13}>
        {outcome === 'taken'
          ? 'Confirm only a dose you actually took. Plans do not create dose records.'
          : 'This records an outcome only. Inventory will not change.'}
      </Copy>
    </FormDialog>
  );
}

export function CorrectDoseForm({
  dose,
  onClose,
}: {
  dose: Dose;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [reason, setReason] = useState('');
  const [returnStock, setReturn] = useState(false);
  return (
    <FormDialog
      title="Correct dose record"
      onClose={onClose}
      submitLabel="Void this record"
      destructive
      onSubmit={(operationId) =>
        run(
          [{ type: 'dose.void', id: dose.id, reason, returnStock }],
          operationId,
        )
      }
    >
      <Copy>
        {dose.medicine.name} · {dose.amount} {dose.unit} · {dose.outcome}
      </Copy>
      <Notice>
        The original record remains visible as corrected. If needed, record the
        correct dose afterward.
      </Notice>
      <Field
        label="Reason for correction"
        value={reason}
        onChange={setReason}
        multiline
      />
      {dose.deductStock && (
        <Toggle
          label="Return the deducted amount to the original batch"
          hint="Use only if the medicine was not consumed."
          value={returnStock}
          onChange={setReturn}
        />
      )}
    </FormDialog>
  );
}
