import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Database } from '../integrations/server/database';
import { createServerApp } from '../integrations/server/app';
import { connectionScopes } from '../src/application/connected/contracts';
import { fixture, now } from '../tests/fixtures';

test('connected medicine record, human review, reload, offline cache and revocation', async ({
  page,
  context,
}, testInfo) => {
  const db = new Database(':memory:');
  let app: Express;
  const listener = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) =>
    listener.listen(0, '127.0.0.1', resolve),
  );
  const base = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  const services = createServerApp({
    db,
    baseUrl: base,
    webRoot: 'dist',
    clients: [
      {
        client_id: 'browser-test',
        client_name: 'Synthetic ChatGPT client',
        redirect_uris: ['http://127.0.0.1/callback'],
      },
    ],
  });
  app = services.app;
  const account = services.identity.provision();
  const data = fixture();
  services.records.import(account.subject, {
    format: 'medkit',
    exportedAt: now,
    state: data.state,
  });
  const client = new Client({ name: 'synthetic-browser-client', version: '1' });
  try {
    await page.goto(base + '/connections');
    await page.getByLabel('Access key', { exact: true }).fill(account.key);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(
      page.getByText('Connected space', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('No changes to review.')).toBeVisible();
    const verifier = 'e'.repeat(64);
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'browser-test',
      redirect_uri: 'http://127.0.0.1/callback',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: connectionScopes.join(' '),
      resource: base + '/mcp',
      state: 'browser-state',
    });
    await page.route('http://127.0.0.1/callback*', (route) =>
      route.fulfill({ body: 'Synthetic OAuth callback' }),
    );
    await page.goto(base + '/authorize?' + query);
    await expect(
      page.getByRole('heading', { name: 'Connect Synthetic ChatGPT client' }),
    ).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.waitForURL('http://127.0.0.1/callback*');
    const code = new URL(page.url()).searchParams.get('code')!;
    const exchange = await fetch(base + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'browser-test',
        code,
        code_verifier: verifier,
        redirect_uri: 'http://127.0.0.1/callback',
        resource: base + '/mcp',
      }),
    });
    expect(exchange.status).toBe(200);
    const token = await exchange.json();
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: {
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
      }),
    );
    const proposal = await client.callTool({
      name: 'prepare_record_change',
      arguments: {
        requestId: randomUUID(),
        userStatement: 'I took one tablet at 4 pm Singapore time.',
        change: { kind: 'record_dose', dose: data.dose().data },
      },
    });
    const review = proposal.structuredContent as { reviewUrl: string };
    await page.goto(review.reviewUrl);
    await page
      .getByRole('button', { name: 'Review change', exact: true })
      .click();
    await expect(page.getByText('1 tablet', { exact: true })).toBeVisible();
    await expect(
      page.getByText('10 → 9 tablet', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('connected-review.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Confirm and save', exact: true })
      .click();
    await expect(
      page.getByText('Your confirmed change has been saved.'),
    ).toBeVisible();
    await page.goto(base + '/history');
    await expect(
      page.getByText('Example medicine', { exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Connected space', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Example medicine', { exact: true }).first(),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByText(/Showing the last downloaded records/),
    ).toBeVisible();
    await expect(
      page.getByText('Example medicine', { exact: true }).first(),
    ).toBeVisible();
    await context.setOffline(false);
    await page
      .getByRole('button', { name: 'Refresh records', exact: true })
      .click();
    await expect(
      page.getByText(/Showing the last downloaded records/),
    ).toHaveCount(0);
    await page.goto(base + '/connections');
    await page
      .getByRole('button', { name: 'Revoke access', exact: true })
      .click();
    await expect(page.getByText(/Access revoked/)).toBeVisible();
    await expect(
      client.callTool({ name: 'get_recent_doses', arguments: {} }),
    ).rejects.toThrow();
    expect(db.records(account.subject).state.doses).toHaveLength(1);
    expect(db.records(account.subject).state.batches[0]!.quantity).toBe(9);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByText('On this device', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect', exact: true }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
    await client.close();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    db.close();
  }
});
