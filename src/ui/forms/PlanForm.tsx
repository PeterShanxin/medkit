import { useState } from 'react';
import { localDate } from '../../domain/model';
import { Choice, Copy, Field, FormDialog } from '../components';
import { useRecords, uuid } from '../store';

export function PlanForm({
  medicineId,
  onClose,
}: {
  medicineId?: string;
  onClose(): void;
}) {
  const { state, run } = useRecords();
  const medicines = state!.medicines.filter((item) => !item.archived);
  const [selected, setSelected] = useState(
    medicineId ?? medicines[0]?.id ?? '',
  );
  const [amount, setAmount] = useState('');
  const [instructions, setInstructions] = useState('');
  const [kind, setKind] = useState('as-needed');
  const [times, setTimes] = useState('08:00');
  const [startOn, setStart] = useState(localDate());
  const [endOn, setEnd] = useState('');
  const [source, setSource] = useState('user');
  const [episodeId, setEpisode] = useState('');
  const medicine = medicines.find((item) => item.id === selected);
  return (
    <FormDialog
      title="Add medication plan"
      submitLabel="Save plan"
      onClose={onClose}
      onSubmit={async (edit) => {
        if (!medicine) throw new Error('Add a medicine to your cabinet first.');
        await run(
          [
            {
              type: 'regimen.add',
              id: uuid(),
              data: {
                medicineId: medicine.id,
                amount: Number(amount),
                unit: medicine.unit,
                instructions,
                kind: kind as 'scheduled' | 'as-needed',
                times:
                  kind === 'scheduled'
                    ? times.split(',').map((item) => item.trim())
                    : [],
                startOn,
                endOn: endOn || null,
                source: source as 'user' | 'clinician',
                episodeId: episodeId || null,
              },
            },
          ],
          edit,
        );
      }}
    >
      <Choice
        label="Medicine"
        value={selected}
        onChange={(value) => {
          setSelected(value);
          setAmount('');
        }}
        options={medicines.map((item) => ({
          value: item.id,
          label: item.name,
        }))}
      />
      <Field
        label={`Planned amount (${medicine?.unit ?? 'unit'})`}
        value={amount}
        onChange={setAmount}
        keyboard="decimal-pad"
      />
      <Field
        label="Instructions"
        value={instructions}
        onChange={setInstructions}
        placeholder="Copy your label or clinician’s instructions"
        multiline
      />
      <Choice
        label="Plan type"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'as-needed', label: 'As needed' },
          { value: 'scheduled', label: 'Scheduled' },
        ]}
      />
      {kind === 'scheduled' && (
        <Field
          label="Times (24-hour, comma-separated)"
          value={times}
          onChange={setTimes}
          placeholder="08:00, 20:00"
          hint="Times are recorded in your device’s local time. Notifications are not enabled."
        />
      )}
      <Field
        label="Start date"
        value={startOn}
        onChange={setStart}
        placeholder="YYYY-MM-DD"
      />
      <Field
        label="End date (optional)"
        value={endOn}
        onChange={setEnd}
        placeholder="YYYY-MM-DD"
      />
      <Choice
        label="Instruction source"
        value={source}
        onChange={setSource}
        options={[
          { value: 'user', label: 'User entered' },
          { value: 'clinician', label: 'Clinician provided' },
        ]}
      />
      <Choice
        label="Related episode"
        value={episodeId}
        onChange={setEpisode}
        options={[
          { value: '', label: 'No episode' },
          ...state!.episodes
            .filter((episode) => !episode.resolvedAt)
            .map((episode) => ({ value: episode.id, label: episode.title })),
        ]}
      />
      <Copy muted size={13}>
        Saving a plan does not record a dose or change stock. MedKit does not
        verify these instructions.
      </Copy>
    </FormDialog>
  );
}
