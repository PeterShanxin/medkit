import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDatabase } from '../integrations/server/sqlite';
import { createServerApp } from '../integrations/server/app';
import { connectionScopes } from '../src/application/connected/contracts';
import { fixture, now, medicineInput } from '../tests/fixtures';

test('connected medicine record, human review, reload, offline cache and revocation', async ({
  page,
  context,
}, testInfo) => {
  await page.emulateMedia({
    colorScheme: testInfo.project.name === 'mobile' ? 'dark' : 'light',
  });
  const callbackServer = createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    });
    res.end('Synthetic OAuth callback');
  });
  await new Promise<void>((resolve) =>
    callbackServer.listen(0, '127.0.0.1', resolve),
  );
  const callback = `http://127.0.0.1:${(callbackServer.address() as { port: number }).port}/callback`;
  const db = openDatabase(':memory:');
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
        redirect_uris: [callback],
      },
    ],
  });
  app = services.app;
  const account = await services.identity.provision();
  const data = fixture();
  await services.records.import(account.subject, {
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
      redirect_uri: callback,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: connectionScopes.join(' '),
      resource: base + '/mcp',
      state: 'browser-state',
    });
    await page.goto(base + '/authorize?' + query);
    await expect(
      page.getByRole('heading', { name: 'Connect Synthetic ChatGPT client' }),
    ).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.origin === new URL(callback).origin && url.pathname === '/callback',
    );
    const code = new URL(page.url()).searchParams.get('code')!;
    const exchange = await fetch(base + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'browser-test',
        code,
        code_verifier: verifier,
        redirect_uri: callback,
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
      animations: 'disabled',
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
    expect((await db.records(account.subject)).state.doses).toHaveLength(1);
    expect((await db.records(account.subject)).state.batches[0]!.quantity).toBe(
      9,
    );
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
    await new Promise<void>((resolve) => callbackServer.close(() => resolve()));
    db.close();
  }
});

test('connected forms recover a lost response and reject edits from an older version', async ({
  page,
}) => {
  const db = openDatabase(':memory:');
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
    clients: [],
  });
  app = services.app;
  const account = await services.identity.provision();
  const data = fixture();
  await services.records.import(account.subject, {
    format: 'medkit',
    exportedAt: now,
    state: data.state,
  });
  try {
    await page.goto(base + '/connections');
    await page.getByLabel('Access key', { exact: true }).fill(account.key);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(
      page.getByText('Connected space', { exact: true }),
    ).toBeVisible();
    await page.goto(base + '/medicine/' + data.medicineId);
    await page
      .getByRole('button', { name: 'Record a dose', exact: true })
      .click();
    await page.getByLabel('Amount (tablet)', { exact: true }).fill('1');
    let first = true;
    const payloads: unknown[] = [];
    await page.route(base + '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      payloads.push(route.request().postDataJSON());
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      if (first) {
        first = false;
        await route.abort('failed');
      } else await route.fulfill({ response });
    });
    await page
      .getByRole('button', { name: 'Confirm dose taken', exact: true })
      .click();
    await expect(page.getByText(/Save status is unknown/)).toBeVisible();
    expect((await db.records(account.subject)).state.batches[0]!.quantity).toBe(
      9,
    );
    await page
      .getByRole('button', { name: 'Confirm dose taken', exact: true })
      .click();
    await expect(page.getByText(/Save status is unknown/)).toHaveCount(0);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect((await db.records(account.subject)).state.doses).toHaveLength(1);
    await page.unroute(base + '/api/records');

    await page
      .getByRole('button', { name: 'Edit medicine', exact: true })
      .click();
    await page
      .getByLabel('Generic or Chinese name (optional)')
      .fill('My stale edit');
    const current = await db.records(account.subject);
    await services.records.execute(account.subject, {
      operationId: randomUUID(),
      version: current.version,
      commands: [
        {
          type: 'medicine.save',
          id: data.medicineId,
          data: {
            ...medicineInput,
            genericName: 'Corrected on another device',
          },
        },
      ],
    });
    // Exercise the real background refresh while the form retains its initial values.
    const refreshed = page.waitForResponse(
      (r) =>
        r.url() === base + '/api/records' && r.request().method() === 'GET',
    );
    await page.evaluate(() => {
      const channel = new BroadcastChannel('medkit-personal');
      channel.postMessage('changed');
      channel.close();
    });
    await refreshed;
    await page
      .getByRole('button', { name: 'Save medicine', exact: true })
      .click();
    await expect(
      page.getByText('Records changed. Refresh and review the change again.'),
    ).toBeVisible();
    expect(
      (await db.records(account.subject)).state.medicines[0]!.genericName,
    ).toBe('Corrected on another device');
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    db.close();
  }
});
