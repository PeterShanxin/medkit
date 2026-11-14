import { useState } from 'react';
import { Link } from 'expo-router';
import { View } from 'react-native';
import { Download, Plus } from 'lucide-react-native';
import { consultationSummary } from '../../application/queries';
import { localDate, type State } from '../../domain/model';
import { saveExport } from '../../storage/export-file';
import {
  Button,
  Choice,
  Copy,
  Field,
  FormDialog,
  Notice,
  Panel,
  SectionTitle,
} from '../components';
import { ProfileForm } from '../forms/ProfileForm';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';

export function SettingsScreen() {
  const { state, run, mode, setMode, erase, exportRecords, connected } =
    useRecords();
  const [profile, setProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!state) return null;
  const exportData = async (summary: boolean) => {
    try {
      setError('');
      await saveExport(
        `medkit-${summary ? 'consultation' : 'records'}-${localDate()}.${summary ? 'txt' : 'json'}`,
        summary ? consultationSummary(state) : await exportRecords(),
        summary ? 'text/plain' : 'application/json',
      );
      setMessage('The export was handed to your device. Keep copies private.');
    } catch {
      setError(
        'The export could not be created. Your records have not changed. Try again.',
      );
    }
  };
  return (
    <>
      <PageHeading
        title="Your space"
        description="A few preferences. Full ownership of your records."
      />
      <View style={{ gap: 24, maxWidth: 800 }}>
        {error && <Notice danger>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <Panel>
          <SectionTitle title="Safety context">
            <Button
              label="Edit context"
              icon={Plus}
              kind="quiet"
              small
              onPress={() => setProfile(true)}
            />
          </SectionTitle>
          <Copy size={14}>
            Allergies:{' '}
            {state.profile.allergyStatus === 'unknown'
              ? 'Not recorded'
              : state.profile.allergyStatus === 'none-known'
                ? 'None known (user reported)'
                : state.profile.allergies.join(', ')}
          </Copy>
          <Copy muted size={13} style={{ marginTop: 10 }}>
            {state.profile.riskStatus === 'unknown'
              ? 'Other health context not recorded.'
              : state.profile.riskNotes}
          </Copy>
        </Panel>
        <Panel>
          <SectionTitle title="Appearance" />
          <Choice
            label="Theme"
            value={state.preferences.theme}
            onChange={(theme) =>
              void run([
                {
                  type: 'preferences.save',
                  id: state.profile.id,
                  theme: theme as State['preferences']['theme'],
                },
              ]).catch(() =>
                setError('Your preference could not be saved. Try again.'),
              )
            }
            options={[
              { value: 'system', label: 'Use device setting' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Panel>
        <Panel>
          <SectionTitle title="Your records" />
          <Copy muted size={14}>
            {connected
              ? 'Saved in your connected space, with a downloaded copy on this device. Changes require a connection. Your separate local records are unchanged.'
              : 'Saved on this device. No account or cloud sync is required.'}{' '}
            MedKit does not encrypt its databases. Use a device lock and a
            private browser profile.
          </Copy>
          <Copy muted size={13} style={{ marginTop: 12 }}>
            Browser data can be removed by storage cleanup. Exports contain
            sensitive information. Save them privately and share only with
            people you trust.
          </Copy>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 20,
            }}
          >
            <Button
              label="Export all records"
              icon={Download}
              kind="secondary"
              onPress={() => void exportData(false)}
            />
            <Button
              label="Consultation summary"
              kind="quiet"
              onPress={() => void exportData(true)}
            />
          </View>
        </Panel>
        <Panel>
          <SectionTitle title="AI & external access" />
          <Copy muted size={14}>
            {connected
              ? 'Manage authorized clients and review their proposed changes in Connections.'
              : 'Connect a hosted MedKit space to share records with authorized AI clients. Local record checks work offline.'}
          </Copy>
          <Link href="/connections" style={{ marginTop: 16 }}>
            <Copy>Manage connections →</Copy>
          </Link>
          <Copy muted size={13} style={{ marginTop: 12 }}>
            Sharing an export gives its recipient a copy. Deleting your records
            here does not delete copies you previously shared.
          </Copy>
        </Panel>
        <Panel>
          <SectionTitle title="Sample cabinet" />
          <Copy muted size={14}>
            Explore synthetic examples in a separate space. Your own records
            stay where they are.
          </Copy>
          <View style={{ marginTop: 16 }}>
            <Button
              label={
                mode === 'demo' ? 'Return to my records' : 'Explore sample data'
              }
              kind="secondary"
              onPress={() => setMode(mode === 'demo' ? 'personal' : 'demo')}
            />
          </View>
        </Panel>
        {mode === 'personal' && (
          <View style={{ gap: 12, paddingVertical: 16 }}>
            <Copy size={18} weight="medium">
              {connected ? 'Delete connected records' : 'Delete local records'}
            </Copy>
            <Copy muted size={13}>
              {connected
                ? 'Remove all records and pending changes from this connected space, and revoke every AI client. Other downloaded or exported copies remain. Your separate local records are unchanged.'
                : 'Remove all medicines, plans, dose history, episodes, safety context, and audit records from this device.'}{' '}
              Export anything you want to keep first.
            </Copy>
            <Button
              label="Delete all my records"
              kind="danger"
              onPress={() => {
                setConfirm('');
                setDeleting(true);
              }}
            />
          </View>
        )}
      </View>
      {profile && <ProfileForm onClose={() => setProfile(false)} />}
      {deleting && (
        <FormDialog
          title={
            connected
              ? 'Delete connected records?'
              : 'Delete all local records?'
          }
          destructive
          submitLabel="Permanently delete"
          onClose={() => setDeleting(false)}
          onSubmit={async () => {
            if (confirm !== 'DELETE')
              throw new Error('Type DELETE to confirm.');
            await erase();
            setMessage(
              connected
                ? 'Connected records deleted. AI access revoked.'
                : 'Your local records have been deleted.',
            );
          }}
        >
          <Notice danger>
            This cannot be undone. Files you exported and copies on other
            devices remain unchanged.
          </Notice>
          <Field
            label="Type DELETE to confirm"
            value={confirm}
            onChange={setConfirm}
          />
        </FormDialog>
      )}
    </>
  );
}
