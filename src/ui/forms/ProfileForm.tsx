import { useState } from 'react';
import { type ProfileInput } from '../../domain/model';
import { Choice, Copy, Field, FormDialog } from '../components';
import { useRecords } from '../store';

export function ProfileForm({ onClose }: { onClose(): void }) {
  const { state, run } = useRecords();
  const profile = state!.profile;
  const [allergyStatus, setStatus] = useState<ProfileInput['allergyStatus']>(
    profile.allergyStatus,
  );
  const [allergies, setAllergies] = useState(profile.allergies.join(', '));
  const [riskNotes, setNotes] = useState(profile.riskNotes);
  return (
    <FormDialog
      title="Personal safety context"
      onClose={onClose}
      submitLabel="Save context"
      onSubmit={(operationId) =>
        run(
          [
            {
              type: 'profile.save',
              id: profile.id,
              data: {
                allergyStatus,
                allergies:
                  allergyStatus === 'recorded'
                    ? allergies
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean)
                    : [],
                riskStatus: riskNotes.trim() ? 'recorded' : 'unknown',
                riskNotes,
              },
            },
          ],
          operationId,
        )
      }
    >
      <Choice
        label="Allergies"
        value={allergyStatus}
        onChange={(value) => setStatus(value as ProfileInput['allergyStatus'])}
        options={[
          { value: 'unknown', label: 'Not recorded / uncertain' },
          { value: 'none-known', label: 'No known allergies (user reported)' },
          { value: 'recorded', label: 'Record known allergies' },
        ]}
      />
      {allergyStatus === 'recorded' && (
        <Field
          label="Known allergies (comma-separated)"
          value={allergies}
          onChange={setAllergies}
        />
      )}
      <Field
        label="Other safety context (optional)"
        value={riskNotes}
        onChange={setNotes}
        multiline
        hint="Relevant conditions, pregnancy or breastfeeding, age concerns, and other medicines or supplements."
      />
      <Copy muted size={13}>
        Your context is included in consultation exports. MedKit does not
        perform comprehensive allergy or interaction screening.
      </Copy>
    </FormDialog>
  );
}
