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
import { PageHeading } from '../Shell';
import { useRecords } from '../store';

export function IntegrationsScreen() {
  const { state, connected, mode } = useRecords();
  const subject = connected ? state?.profile.id : undefined;
  const connectionRequest = useCallback(
    (path: string, body?: unknown) => request(path, body, subject),
    [subject],
  );
  const [mcpUrl, setMcpUrl] = useState('');
  const [canInvite, setCanInvite] = useState(false);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [username, setUsername] = useState('');
  const [candidate, setCandidate] = useState<z.infer<
    typeof memberProfileSchema
  > | null>(null);
  const [revoking, setRevoking] = useState<MemberSummary | null>(null);
  const [advanced, setAdvanced] = useState(false);
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
    void connectionRequest('capabilities')
      .then((value) => {
        const capability = z.object({ mcpUrl: z.string().url() }).parse(value);
        if (active) setMcpUrl(capability.mcpUrl);
      })
      .catch(() => {});
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
  return (
    <>
      <PageHeading title="Apps & access" />
      <View style={{ maxWidth: 800, gap: 24 }}>
        {error && <Notice danger>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <Panel>
          <SectionTitle title="Use MedKit in ChatGPT" />
          <View style={{ gap: 16 }}>
            <Copy>
              Ask about your cabinet, check recorded doses, or prepare a change.
              You review each proposed change in MedKit before it is saved.
            </Copy>
            <Copy weight="medium">1. Sign in to your MedKit space</Copy>
            <Copy muted>
              {connected
                ? 'You are connected. ChatGPT can only use the account you authorize next.'
                : 'Use your invited GitHub account. Each person gets a separate cabinet. Local records stay on this device unless you explicitly upload them.'}
            </Copy>
            <Link href="/connections">
              <Copy>
                {connected
                  ? 'Manage connections & pending changes →'
                  : 'Sign in to MedKit →'}
              </Copy>
            </Link>
            <Copy weight="medium">2. Connect the MedKit plugin in ChatGPT</Copy>
            <Copy muted>
              Open ChatGPT on the web. If MedKit is already available to your
              ChatGPT account or workspace, select it and choose Connect. Sign
              in to MedKit with the same GitHub account and review the requested
              permissions.
            </Copy>
            <Link
              href="https://chatgpt.com/plugins"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Copy>Open ChatGPT plugins ↗</Copy>
            </Link>
            <Notice>
              MedKit is not listed in the public plugin directory. A MedKit
              invitation gives you Web access; your host must separately arrange
              plugin access for your ChatGPT account or workspace.
            </Notice>
            <Copy muted size={13}>
              Read access is enough to ask about records. To prepare additions
              or corrections, also enable “Allow requests to add or correct
              records”. You can revoke access later in Connections.
            </Copy>
            <Copy weight="medium">3. Select @MedKit in your message</Copy>
            <Copy selectable>
              List my medicines and show any low-stock or expiry alerts.
            </Copy>
            <Copy selectable>
              I want to add a medicine. Ask me for its name, ingredients,
              strength, unit, quantity and expiry, then prepare a request for my
              review.
            </Copy>
            <Copy selectable>
              I actually took [medicine], [amount and unit], at [date, time and
              time zone]. Prepare a dose record for my review.
            </Copy>
            <Copy muted>
              Open the review link, check the details, then choose Confirm and
              save. Return to ChatGPT and select @MedKit again to check the
              saved result. A suggestion or plan is never a record of a dose
              taken.
            </Copy>
            <Copy muted size={13}>
              Only your authorized connected records are shared. Your AI
              provider may retain returned information. No MedKit OpenAI API key
              is needed. Account and workspace restrictions apply; start with
              ChatGPT on the web.
            </Copy>
            <Link
              href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Copy>ChatGPT connection requirements ↗</Copy>
            </Link>
          </View>
        </Panel>
        <Panel>
          <SectionTitle title="Other MCP clients" />
          <Copy muted>
            Compatible clients can request access to the same private account.
            Your host must register the client's exact callback before
            connecting.
          </Copy>
          <Button
            label={
              advanced ? 'Hide connection details' : 'Show connection details'
            }
            kind="quiet"
            onPress={() => setAdvanced(!advanced)}
          />
          {advanced && (
            <View style={{ gap: 12, marginTop: 12 }}>
              {mcpUrl ? (
                <Copy selectable>{mcpUrl}</Copy>
              ) : (
                <Copy>
                  Open the hosted Web app to find its connection address.
                </Copy>
              )}
              <Copy muted size={13}>
                Use OAuth with PKCE and a host-provided client ID. Never paste
                an owner key or the GitHub application secret into an AI client.
                Creating a custom ChatGPT plugin may require host setup and an
                eligible ChatGPT account.
              </Copy>
            </View>
          )}
        </Panel>
        {canInvite && mode === 'personal' && (
          <Panel>
            <SectionTitle title="Invite people" />
            <View style={{ gap: 16 }}>
              <Copy muted>
                Invite a GitHub user to create their own private MedKit space.
                This does not share your cabinet or give them
                invitation-management access.
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
                You can manage access here, but cannot open another person's
                health records through this interface. The hosting operator
                still controls the underlying database. Re-inviting a revoked
                person restores their existing space.
              </Copy>
            </View>
          </Panel>
        )}
        <Link href="/settings">
          <Copy>Back to settings</Copy>
        </Link>
      </View>
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
