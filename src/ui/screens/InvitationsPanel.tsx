import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Platform, View } from 'react-native';
import { z } from 'zod';
import {
  memberProfileSchema,
  memberSummarySchema,
  type MemberSummary,
} from '../../application/connected/members';
import { connectionRequest as request } from '../../storage/connected-client';
import {
  Button,
  Copy,
  Field,
  FormDialog,
  Notice,
  Panel,
  SectionTitle,
} from '../components';
import { useRecords } from '../store';

export function InvitationsPanel() {
  const { state, connected, mode } = useRecords();
  const subject = connected ? state?.profile.id : undefined;
  const connectionRequest = useCallback(
    (path: string, body?: unknown) => request(path, body, subject),
    [subject],
  );
  const [canInvite, setCanInvite] = useState(false);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [username, setUsername] = useState('');
  const [candidate, setCandidate] = useState<z.infer<
    typeof memberProfileSchema
  > | null>(null);
  const [revoking, setRevoking] = useState<MemberSummary | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function loadMembers() {
    setMembers(
      z.array(memberSummarySchema).parse(await connectionRequest('members')),
    );
  }
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    setCanInvite(false);
    setMembers([]);
    setCandidate(null);
    setRevoking(null);
    setUsername('');
    setMessage('');
    if (connected)
      void connectionRequest('access')
        .then(async (value) => {
          const access = z.object({ canInvite: z.boolean() }).parse(value);
          if (!active) return;
          setCanInvite(access.canInvite);
          if (access.canInvite) await loadMembers();
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [connected, connectionRequest]);
  async function action(fn: () => Promise<void>) {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Try again.');
    } finally {
      setWorking(false);
    }
  }
  if (!canInvite || mode !== 'personal') return null;
  return (
    <>
      {error && <Notice danger>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <Panel>
        <SectionTitle title="Invite people" />
        <View style={{ gap: 16 }}>
          <Copy muted>
            Invite a GitHub user to create their own private MedKit space. This
            does not share your cabinet or give them invitation-management
            access.
          </Copy>
          <Field
            label="GitHub username"
            value={username}
            onChange={(value) => {
              setUsername(value);
              setCandidate(null);
            }}
          />
          <Button
            label="Find GitHub user"
            disabled={working || !username.trim()}
            onPress={() =>
              void action(async () =>
                setCandidate(
                  memberProfileSchema.parse(
                    await connectionRequest('members/lookup', {
                      username: username.trim(),
                    }),
                  ),
                ),
              )
            }
          />
          {candidate && (
            <View style={{ gap: 12 }}>
              <Link
                href={`https://github.com/${candidate.login}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Copy>Check GitHub profile: {candidate.login} ↗</Copy>
              </Link>
              <Button
                label={`Invite ${candidate.login}`}
                disabled={working}
                onPress={() =>
                  void action(async () => {
                    await connectionRequest('members', candidate);
                    setCandidate(null);
                    setUsername('');
                    await loadMembers();
                    setMessage(
                      'Invitation enabled. Share this MedKit website with the person and ask them to sign in with their GitHub account. No message has been sent.',
                    );
                  })
                }
              />
            </View>
          )}
          {members.length === 0 && <Copy muted>No invitations yet.</Copy>}
          {members.map((member) => (
            <View key={member.githubId} style={{ gap: 8 }}>
              <Copy>
                {member.login} ·{' '}
                {member.status === 'invited'
                  ? 'Waiting for first sign-in'
                  : member.status === 'active'
                    ? 'Joined'
                    : 'Access revoked'}
              </Copy>
              {member.status !== 'revoked' && (
                <Button
                  label={`Revoke ${member.login}`}
                  kind="danger"
                  small
                  disabled={working}
                  onPress={() => setRevoking(member)}
                />
              )}
            </View>
          ))}
          <Copy muted size={13}>
            You can manage access here, but cannot open another person's health
            records through this interface. The hosting operator still controls
            the underlying database. Re-inviting a revoked person restores their
            existing space.
          </Copy>
        </View>
      </Panel>
      {revoking && (
        <FormDialog
          title={`Revoke ${revoking.login}?`}
          submitLabel="Revoke access"
          destructive
          onClose={() => setRevoking(null)}
          onSubmit={async () => {
            await connectionRequest(`members/${revoking.githubId}/revoke`, {});
            await loadMembers();
            setMessage(
              'Access revoked. Existing browser sessions and AI connections have ended.',
            );
          }}
        >
          <Copy>
            This prevents sign-in, ends this person's browser sessions and AI
            access, and rejects pending changes. Their server records are
            retained. Previously downloaded or shared copies remain outside
            MedKit's control.
          </Copy>
        </FormDialog>
      )}
    </>
  );
}
