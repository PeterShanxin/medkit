import { useState } from 'react';
import { type Episode } from '../../domain/model';
import { Choice, Copy, Field, FormDialog } from '../components';
import { formatDateTimeInput, parseDateTimeInput } from '../format';
import { useRecords, uuid } from '../store';

export function EpisodeForm({ onClose }: { onClose(): void }) {
  const { run } = useRecords();
  const [title, setTitle] = useState('');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState('mild');
  const [onset, setOnset] = useState(formatDateTimeInput());
  const [notes, setNotes] = useState('');
  return (
    <FormDialog
      title="Start a health episode"
      submitLabel="Start episode"
      onClose={onClose}
      onSubmit={async (edit) => {
        const id = uuid();
        const at = parseDateTimeInput(onset);
        await run(
          [
            { type: 'episode.add', id, data: { title, onsetAt: at, notes } },
            {
              type: 'observation.add',
              id: uuid(),
              data: {
                episodeId: id,
                symptom,
                severity: severity as 'mild' | 'moderate' | 'severe',
                at,
                notes: '',
              },
            },
          ],
          edit,
        );
      }}
    >
      <Field
        label="Episode name"
        value={title}
        onChange={setTitle}
        placeholder="e.g. Feeling under the weather"
      />
      <Field
        label="Symptom"
        value={symptom}
        onChange={setSymptom}
        placeholder="What are you experiencing?"
      />
      <Severity value={severity} onChange={setSeverity} />
      <Field
        label="Started (local time)"
        value={onset}
        onChange={setOnset}
        placeholder="YYYY-MM-DD HH:mm"
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        multiline
      />
      <Copy muted size={13}>
        Symptoms are your observations. They are not a confirmed diagnosis.
      </Copy>
    </FormDialog>
  );
}

function Severity({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  return (
    <Choice
      label="Severity"
      value={value}
      onChange={onChange}
      options={['mild', 'moderate', 'severe'].map((item) => ({
        value: item,
        label: item[0]!.toUpperCase() + item.slice(1),
      }))}
    />
  );
}

export function ObservationForm({
  episode,
  onClose,
}: {
  episode: Episode;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState('mild');
  const [at, setAt] = useState(formatDateTimeInput());
  const [notes, setNotes] = useState('');
  return (
    <FormDialog
      title="Update symptoms"
      submitLabel="Record observation"
      onClose={onClose}
      onSubmit={(edit) =>
        run(
          [
            {
              type: 'observation.add',
              id: uuid(),
              data: {
                episodeId: episode.id,
                symptom,
                severity: severity as 'mild' | 'moderate' | 'severe',
                at: parseDateTimeInput(at),
                notes,
              },
            },
          ],
          edit,
        )
      }
    >
      <Copy weight="medium">{episode.title}</Copy>
      <Field label="Symptom" value={symptom} onChange={setSymptom} />
      <Severity value={severity} onChange={setSeverity} />
      <Field label="Observed (local time)" value={at} onChange={setAt} />
      <Field
        label="Progress or notes (optional)"
        value={notes}
        onChange={setNotes}
        multiline
      />
    </FormDialog>
  );
}

export function ConsultationForm({
  episode,
  onClose,
}: {
  episode: Episode;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [at, setAt] = useState(formatDateTimeInput());
  const [notes, setNotes] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [source, setSource] = useState('user-reported');
  return (
    <FormDialog
      title="Record a consultation"
      onClose={onClose}
      onSubmit={(edit) =>
        run(
          [
            {
              type: 'consultation.add',
              id: uuid(),
              data: {
                episodeId: episode.id,
                at: parseDateTimeInput(at),
                notes,
                diagnosis,
                diagnosisSource: source as
                  'user-reported' | 'clinician-confirmed',
              },
            },
          ],
          edit,
        )
      }
    >
      <Copy>{episode.title}</Copy>
      <Field label="Consultation (local time)" value={at} onChange={setAt} />
      <Field
        label="Consultation and treatment notes"
        value={notes}
        onChange={setNotes}
        multiline
      />
      <Field
        label="Diagnosis (optional)"
        value={diagnosis}
        onChange={setDiagnosis}
      />
      {diagnosis && (
        <Choice
          label="Diagnosis source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'user-reported', label: 'User reported' },
            { value: 'clinician-confirmed', label: 'Clinician confirmed' },
          ]}
        />
      )}
    </FormDialog>
  );
}

export function ResolveForm({
  episode,
  onClose,
}: {
  episode: Episode;
  onClose(): void;
}) {
  const { run } = useRecords();
  const [at, setAt] = useState(formatDateTimeInput());
  return (
    <FormDialog
      title="Mark recovered"
      onClose={onClose}
      submitLabel="Mark recovered"
      onSubmit={(edit) =>
        run(
          [
            {
              type: 'episode.resolve',
              id: episode.id,
              at: parseDateTimeInput(at),
            },
          ],
          edit,
        )
      }
    >
      <Copy>{episode.title}</Copy>
      <Field label="Recovery (local time)" value={at} onChange={setAt} />
      <Copy muted>
        Symptoms and dose records stay in your history. Medication plans stay as
        recorded; recovery does not change treatment instructions.
      </Copy>
    </FormDialog>
  );
}
