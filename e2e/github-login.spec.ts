import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { Express } from 'express';
import { openDatabase } from '../integrations/server/sqlite';
import { Identity } from '../integrations/server/identity';
import { createServerApp } from '../integrations/server/app';
import { Records } from '../integrations/server/records';
import { fixture, now } from '../tests/fixtures';

test('GitHub sign-in opens the same existing records on a second device and keeps local records separate', async ({
  page,
  browser,
}) => {
  const db = openDatabase(':memory:');
  const owner = await new Identity(db).provision();
  await new Records(db).import(owner.subject, {
    format: 'medkit',
    exportedAt: now,
    state: fixture().state,
  });
  let app: Express;
  const listener = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) =>
    listener.listen(0, '127.0.0.1', resolve),
  );
  const base = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  app = createServerApp({
    db,
    baseUrl: base,
    clients: [],
    webRoot: 'dist',
    github: {
      clientId: 'synthetic-browser-client',
      clientSecret: 'synthetic-secret',
      accounts: [{ githubId: '12345', subject: owner.subject }],
    },
    githubFetch: async (url) =>
      String(url).endsWith('access_token')
        ? Response.json({
            access_token: 'synthetic-token',
            token_type: 'bearer',
          })
        : Response.json({ id: 12345 }),
  }).app;
  const secondContext = await browser.newContext();
  try {
    for (const target of [page, await secondContext.newPage()]) {
      await target.route(
        'https://github.com/login/oauth/authorize?*',
        async (route) => {
          const auth = new URL(route.request().url());
          expect(auth.searchParams.get('scope')).toBe('');
          const callback = new URL(auth.searchParams.get('redirect_uri')!);
          callback.searchParams.set('state', auth.searchParams.get('state')!);
          callback.searchParams.set('code', 'synthetic-browser-code');
          await route.fulfill({
            status: 302,
            headers: { Location: callback.href },
            body: '',
          });
        },
      );
      await target.goto(base + '/');
      await expect(
        target.getByText('On this device', { exact: true }),
      ).toBeVisible();
      await expect(
        target.getByText('Add your first medicine', { exact: true }),
      ).toBeVisible();
      await target.getByRole('link', { name: 'Settings', exact: true }).click();
      await target
        .getByRole('link', { name: 'Manage connections →', exact: true })
        .click();
      await target
        .getByRole('button', { name: 'Sign in with GitHub', exact: true })
        .click();
      await expect(
        target.getByText('Connected space', { exact: true }),
      ).toBeVisible();
      await expect(target).toHaveURL(base + '/connections');
      const session = await target.request.get(base + '/api/session');
      expect((await session.json()).subject).toBe(owner.subject);
      await target.getByRole('link', { name: 'Cabinet', exact: true }).click();
      await expect(
        target.getByRole('button', {
          name: 'Open Example medicine',
          exact: true,
        }),
      ).toBeVisible();
      await target.reload();
      await expect(
        target.getByText('Connected space', { exact: true }),
      ).toBeVisible();
      await target
        .getByRole('link', {
          name: 'Connections & pending changes →',
          exact: true,
        })
        .click();
      await target
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await expect(
        target.getByText('On this device', { exact: true }),
      ).toBeVisible();
      await target.getByRole('link', { name: 'Today', exact: true }).click();
      await expect(
        target.getByText('Add your first medicine', { exact: true }),
      ).toBeVisible();
    }
    expect((await db.records(owner.subject)).state.medicines).toHaveLength(1);
  } finally {
    await secondContext.close();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    db.close();
  }
});
