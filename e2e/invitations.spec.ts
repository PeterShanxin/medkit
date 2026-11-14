import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { openDatabase } from '../integrations/server/sqlite';
import { Identity } from '../integrations/server/identity';
import { createServerApp } from '../integrations/server/app';
import { medicineInput } from '../tests/fixtures';

test('host invites isolated users from the app and revokes access without sharing cabinets', async ({
  page,
  browser,
}) => {
  const db = openDatabase(':memory:');
  const owner = await new Identity(db).provision();
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
      clientId: 'synthetic',
      clientSecret: 'synthetic',
      accounts: [{ githubId: '111', subject: owner.subject, admin: true }],
    },
    githubFetch: async (url, init) => {
      if (String(url).endsWith('/access_token'))
        return Response.json({
          access_token: new URLSearchParams(init?.body?.toString()).get('code'),
          token_type: 'bearer',
        });
      if (String(url) === 'https://api.github.com/user')
        return Response.json({
          id: Number(
            new Headers(init?.headers)
              .get('Authorization')
              ?.replace('Bearer ', ''),
          ),
        });
      const name = String(url).split('/').at(-1)!;
      return Response.json({
        id: name === 'synthetic-alice' ? 222 : 333,
        login: name,
        type: 'User',
      });
    },
  }).app;
  const aliceContext = await browser.newContext(),
    bobContext = await browser.newContext();
  async function signIn(target: Page, id: string) {
    await target.route(
      'https://github.com/login/oauth/authorize?*',
      async (route) => {
        const url = new URL(route.request().url()),
          callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        callback.searchParams.set('code', id);
        await route.fulfill({
          status: 302,
          headers: { Location: callback.href },
          body: '',
        });
      },
    );
    await target.goto(base + '/connections');
    await target
      .getByRole('button', { name: 'Sign in with GitHub', exact: true })
      .click();
    await expect(
      target.getByText('Connected space', { exact: true }),
    ).toBeVisible();
  }
  try {
    await signIn(page, '111');
    await page
      .getByRole('link', {
        name: 'Use MedKit with ChatGPT & other apps →',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Apps & access' }),
    ).toBeVisible();
    await expect(
      page.getByText('MedKit is not listed in the public plugin directory.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open ChatGPT plugins ↗' }),
    ).toHaveAttribute('href', 'https://chatgpt.com/plugins');
    for (const login of ['synthetic-alice', 'synthetic-bob']) {
      await page
        .getByRole('textbox', { name: 'GitHub username', exact: true })
        .fill(login);
      await page
        .getByRole('button', { name: 'Find GitHub user', exact: true })
        .click();
      await page
        .getByRole('button', { name: `Invite ${login}`, exact: true })
        .click();
      await expect(
        page.getByText(`${login} · Waiting for first sign-in`, { exact: true }),
      ).toBeVisible();
    }
    const alice = await aliceContext.newPage(),
      bob = await bobContext.newPage();
    await signIn(alice, '222');
    await signIn(bob, '333');
    const a = (await (await alice.request.get(base + '/api/session')).json())
      .subject;
    const b = (await (await bob.request.get(base + '/api/session')).json())
      .subject;
    expect(a).not.toBe(b);
    expect(a).not.toBe(owner.subject);
    const save = await alice.request.post(base + '/api/records', {
      headers: { Origin: base, 'X-MedKit-Account': a },
      data: {
        operationId: randomUUID(),
        version: 0,
        commands: [
          {
            type: 'medicine.save',
            id: randomUUID(),
            data: { ...medicineInput, name: 'Synthetic Alice only' },
          },
        ],
      },
    });
    expect(save.status()).toBe(200);
    await alice.goto(base + '/cabinet');
    await expect(
      alice.getByRole('button', {
        name: 'Open Synthetic Alice only',
        exact: true,
      }),
    ).toBeVisible();
    await bob.goto(base + '/cabinet');
    await expect(
      bob.getByText('0 medicines · 0 batches', { exact: true }),
    ).toBeVisible();
    await bob.goto(base + '/integrations');
    await expect(
      bob.getByRole('textbox', { name: 'GitHub username', exact: true }),
    ).toHaveCount(0);
    expect((await bob.request.get(base + '/api/members')).status()).toBe(403);
    await page.reload();
    await page
      .getByRole('button', { name: 'Revoke synthetic-alice', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Revoke access', exact: true })
      .click();
    await expect(
      page.getByText('synthetic-alice · Access revoked', { exact: true }),
    ).toBeVisible();
    expect((await alice.request.get(base + '/api/records')).status()).toBe(401);
    expect((await bob.request.get(base + '/api/records')).status()).toBe(200);
    expect((await db.records(a)).state.medicines).toHaveLength(1);
  } finally {
    await aliceContext.close();
    await bobContext.close();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    db.close();
  }
});
