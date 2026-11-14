import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { Platform, View } from 'react-native';
import { z } from 'zod';
import { connectionRequest } from '../../storage/connected-client';
import { Button, Copy, Notice, Panel, SectionTitle } from '../components';
import { PageHeading } from '../Shell';
import { useRecords } from '../store';

export function IntegrationsScreen() {
  const { connected } = useRecords();
  const [mcpUrl, setMcpUrl] = useState('');
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    void connectionRequest('capabilities')
      .then((value) => {
        const capability = z.object({ mcpUrl: z.string().url() }).parse(value);
        if (active) setMcpUrl(capability.mcpUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeading title="Apps & access" />
      <View style={{ maxWidth: 800, gap: 24 }}>
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
                ? 'You are signed in to MedKit. Continue to step 2 to connect this account to ChatGPT.'
                : 'Use your invited GitHub account. Each person gets a separate cabinet. Local records stay on this device unless you explicitly upload them.'}
            </Copy>
            {!connected && (
              <Link href="/connections">
                <Copy>Sign in to MedKit →</Copy>
              </Link>
            )}
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
        <Link href="/settings">
          <Copy>Back to settings</Copy>
        </Link>
      </View>
    </>
  );
}
