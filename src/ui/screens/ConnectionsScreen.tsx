import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import {
  connectionSchema,
  reviewSchema,
  type Review,
} from '../../application/connected/contracts';
import { connectionRequest } from '../../storage/connected-client';
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
import { PageHeading } from '../Shell';
import { useRecords } from '../store';

export function ConnectionsScreen() {
  const { connected, connect, disconnect, refresh, mode } = useRecords();
  const { review: requestedId } = useLocalSearchParams<{ review?: string }>();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [upload, setUpload] = useState('no');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [connections, setConnections] = useState<
    z.infer<typeof connectionSchema>[]
  >([]);
  const [selected, setSelected] = useState<Review | null>(null);
  const [message, setMessage] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setAvailable(false);
      return;
    }
    void connectionRequest('capabilities')
      .then((value) =>
        setAvailable(
          z.object({ connected: z.literal(true) }).safeParse(value).success,
        ),
      )
      .catch(() => setAvailable(false));
  }, []);
  const load = useCallback(async () => {
    if (!connected) return;
    try {
      const [r, c] = await Promise.all([
        connectionRequest('reviews'),
        connectionRequest('connections'),
      ]);
      setReviews(z.array(reviewSchema).parse(r));
      setConnections(z.array(connectionSchema).parse(c));
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Connections could not be refreshed.',
      );
    }
  }, [connected]);
  useEffect(() => {
    void load();
    if (!connected) return;
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load, connected]);
  async function action(fn: () => Promise<void>) {
    setWorking(true);
    setError('');
    try {
      await fn();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }
  const pending = reviews
    .filter((r) => r.status === 'pending')
    .sort(
      (a, b) => Number(b.id === requestedId) - Number(a.id === requestedId),
    );
  return (
    <>
      <PageHeading title="Connections" />
      <View style={{ maxWidth: 800, gap: 24 }}>
        {error && <Notice danger>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        {!connected ? (
          <Panel>
            <SectionTitle title="Your connected space" />
            {available === null ? (
              <Copy muted>Checking connection availability…</Copy>
            ) : !available ? (
              <Copy muted>
                Open your hosted MedKit Web address to connect. This copy keeps
                records on this device.
              </Copy>
            ) : mode === 'demo' ? (
              <Notice>
                Return to your own records in Settings before connecting.
              </Notice>
            ) : (
              <View style={{ gap: 18 }}>
                <Copy muted>
                  Sign in to use the same records in MedKit and authorized AI
                  clients. Connected records are stored on this server. Changes
                  require an internet connection.
                </Copy>
                <Field
                  label="Access key"
                  value={key}
                  onChange={setKey}
                  secure
                />
                <Choice
                  label="Local records"
                  value={upload}
                  onChange={setUpload}
                  options={[
                    { value: 'no', label: 'Keep separate' },
                    { value: 'yes', label: 'Upload to an empty space' },
                  ]}
                />
                <Copy muted size={13}>
                  {upload === 'yes'
                    ? 'Connecting will upload your local medicines, doses, health history, and safety context. Local originals remain on this device. An existing connected space cannot be overwritten.'
                    : 'Connecting opens server records. It does not upload or merge this device’s existing records.'}
                </Copy>
                <Button
                  label="Connect"
                  disabled={working || !key}
                  onPress={() =>
                    void action(async () => {
                      await connect(key, upload === 'yes');
                      setKey('');
                    })
                  }
                />
              </View>
            )}
          </Panel>
        ) : (
          <>
            <Panel>
              <SectionTitle title="Pending changes">
                <Button
                  label="Refresh"
                  small
                  kind="quiet"
                  onPress={() => void load()}
                />
              </SectionTitle>
              <Copy muted size={14}>
                AI clients prepare changes here. Review the exact details before
                saving. Nothing is recorded until you confirm.
              </Copy>
              {pending.length === 0 && (
                <Copy style={{ marginTop: 20 }}>No changes to review.</Copy>
              )}
              {pending.map((review) => (
                <View key={review.id} style={{ marginTop: 22, gap: 10 }}>
                  <Copy weight="medium">{review.title}</Copy>
                  <Copy muted size={13}>
                    {review.clientName} · Expires{' '}
                    {new Date(review.expiresAt).toLocaleTimeString()}
                  </Copy>
                  <Button
                    label="Review change"
                    kind="secondary"
                    onPress={() => setSelected(review)}
                  />
                </View>
              ))}
              {reviews
                .filter((r) => r.status !== 'pending')
                .slice(0, 5)
                .map((r) => (
                  <Copy key={r.id} muted size={13} style={{ marginTop: 14 }}>
                    {r.title} · {r.status}
                  </Copy>
                ))}
            </Panel>
            <Panel>
              <SectionTitle title="Authorized clients" />
              {connections.length === 0 && (
                <Copy muted>
                  No clients are connected. Add this server’s /mcp address in
                  your AI client, then authorize access.
                </Copy>
              )}
              {connections.map((c) => (
                <View key={c.id} style={{ gap: 10, marginBottom: 20 }}>
                  <Copy weight="medium">{c.clientName}</Copy>
                  <Copy muted size={13}>
                    {c.scopes.includes('records:write')
                      ? 'Can read permitted records and request changes'
                      : 'Can read permitted records'}{' '}
                    · Until {new Date(c.expiresAt).toLocaleDateString()}
                  </Copy>
                  <Copy muted size={12}>
                    {c.scopes
                      .map(
                        (s) =>
                          ({
                            'cabinet:read': 'Cabinet',
                            'medication:read': 'Medication',
                            'history:read': 'History',
                            'safety:read': 'Safety context',
                            'records:write': 'Change requests',
                          })[s],
                      )
                      .join(' · ')}
                  </Copy>
                  <Button
                    label="Revoke access"
                    kind="danger"
                    small
                    disabled={working}
                    onPress={() =>
                      void action(async () => {
                        await connectionRequest(
                          `connections/${c.id}/revoke`,
                          {},
                        );
                        await load();
                        setMessage(
                          'Access revoked. Previously returned copies remain with the client.',
                        );
                      })
                    }
                  />
                </View>
              ))}
            </Panel>
            <Panel>
              <SectionTitle title="This device">
                <Button
                  label="Reconnect"
                  kind="quiet"
                  small
                  onPress={() => {
                    setKey('');
                    setReconnecting(true);
                  }}
                />
              </SectionTitle>
              <Copy muted size={14}>
                Sign out to remove this device’s downloaded copy and return to
                local records. Server records and AI connections remain. Use
                Settings to delete connected records and revoke all clients.
              </Copy>
              <View style={{ marginTop: 18 }}>
                <Button
                  label="Sign out"
                  kind="secondary"
                  disabled={working}
                  onPress={() => void action(disconnect)}
                />
              </View>
            </Panel>
          </>
        )}
        <Link href="/settings">
          <Copy>Back to settings</Copy>
        </Link>
      </View>
      {reconnecting && (
        <FormDialog
          title="Reconnect your space"
          submitLabel="Sign in"
          onClose={() => setReconnecting(false)}
          onSubmit={async () => {
            await connect(key, false);
            setKey('');
          }}
        >
          <Field label="Access key" secure value={key} onChange={setKey} />
        </FormDialog>
      )}
      {selected && (
        <FormDialog
          title={selected.title}
          submitLabel="Confirm and save"
          onClose={() => setSelected(null)}
          onSubmit={async () => {
            await connectionRequest(`reviews/${selected.id}`, {
              approve: true,
            });
            await refresh();
            await load();
            setMessage('Your confirmed change has been saved.');
          }}
        >
          <Notice>
            Confirm what actually happened. This request is not medical advice.
            Check medicine labels and amounts against your own records.
          </Notice>
          <Copy muted size={13}>
            Request from {selected.clientName}
          </Copy>
          <Copy>{selected.userStatement}</Copy>
          {selected.details.map((detail, index) => (
            <View key={index} style={{ gap: 4 }}>
              <Copy muted size={12}>
                {detail.label}
              </Copy>
              <Copy>{detail.value}</Copy>
            </View>
          ))}
          <Button
            label="Reject request"
            kind="quiet"
            disabled={working}
            onPress={() =>
              void action(async () => {
                await connectionRequest(`reviews/${selected.id}`, {
                  approve: false,
                });
                setSelected(null);
                await load();
                setMessage('Request rejected. No medical record was changed.');
              })
            }
          />
        </FormDialog>
      )}
    </>
  );
}
