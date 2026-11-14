import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { Express } from 'express';
import { z } from 'zod';
import { openDatabase } from '../integrations/server/sqlite';
import { Identity } from '../integrations/server/identity';
import { GitHubLogin, githubConfig } from '../integrations/server/github-login';
import { createServerApp } from '../integrations/server/app';
import { Records } from '../integrations/server/records';
import { fixture, now } from './fixtures';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
async function setup() {
  const db = openDatabase(':memory:');
  cleanups.push(() => db.close());
  const identity = new Identity(db);
  const account = await identity.provision();
  let time = Date.now();
  let providerId = 12345;
  const calls: { url: string; body?: string }[] = [];
  const provider: typeof fetch = vi.fn(async (url, init) => {
    expect(init?.redirect).toBe('manual');
    calls.push({ url: String(url), body: init?.body?.toString() });
    if (String(url) === 'https://github.com/login/oauth/access_token')
      return Response.json({
        access_token: 'synthetic-provider-token',
        token_type: 'bearer',
      });
    expect(String(url)).toBe('https://api.github.com/user');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer synthetic-provider-token',
    );
    return Response.json({ id: providerId, login: 'renamable-synthetic-name' });
  });
  const config = {
    clientId: 'synthetic-client',
    clientSecret: 'synthetic-secret',
    accounts: [{ githubId: '12345', subject: account.subject }],
  };
  const login = new GitHubLogin(
    db,
    identity,
    new URL('https://synthetic.example'),
    config,
    provider,
    () => time,
  );
  return {
    db,
    identity,
    account,
    login,
    config,
    provider,
    calls,
    advance: () => {
      time += 600001;
    },
    setProviderId: (id: number) => {
      providerId = id;
    },
  };
}
async function begin(login: GitHubLogin) {
  const start = await login.start('/connections');
  const url = new URL(start.authorizationUrl);
  return { ...start, url, state: url.searchParams.get('state')! };
}
it('signs two devices into the same existing account without creating or changing health records', async () => {
  const s = await setup(),
    f = fixture();
  await new Records(s.db).import(s.account.subject, {
    format: 'medkit',
    exportedAt: now,
    state: f.state,
  });
  const before = await s.db.records(s.account.subject);
  const first = await begin(s.login),
    second = await begin(s.login);
  expect(first.url.searchParams.get('scope')).toBe('');
  expect(first.url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(first.url.searchParams.get('redirect_uri')).toBe(
    'https://synthetic.example/api/login/github/callback',
  );
  const a = await s.login.finish(first.state, first.browser, 'first-code');
  const b = await s.login.finish(second.state, second.browser, 'second-code');
  expect(await s.identity.session(a.session.token)).toBe(s.account.subject);
  expect(await s.identity.session(b.session.token)).toBe(s.account.subject);
  expect(a.session.token).not.toBe(b.session.token);
  const verifier = new URLSearchParams(s.calls[0]!.body).get('code_verifier')!;
  expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
    first.url.searchParams.get('code_challenge'),
  );
  expect(await s.db.records(s.account.subject)).toEqual(before);
  expect(await s.db.list('owners', z.unknown())).toHaveLength(1);
  expect(await s.db.list('github-login', z.unknown())).toEqual([]);
  expect(
    JSON.stringify(await s.db.list('sessions', z.unknown())),
  ).not.toContain('synthetic-provider-token');
  await s.identity.logout(a.session.token);
  await expect(s.identity.session(a.session.token)).rejects.toThrow(
    'Sign in again',
  );
  expect(await s.identity.session(b.session.token)).toBe(s.account.subject);
});
it('rejects missing state, wrong-browser callbacks and expired login attempts before provider access', async () => {
  const s = await setup(),
    start = await begin(s.login);
  await expect(s.login.finish('', start.browser, 'code')).rejects.toThrow();
  await expect(
    s.login.finish(start.state, 'another-browser', 'code'),
  ).rejects.toThrow();
  expect(s.calls).toHaveLength(0);
  s.advance();
  await expect(
    s.login.finish(start.state, start.browser, 'code'),
  ).rejects.toThrow();
  expect(s.calls).toHaveLength(0);
});
it('consumes denied and concurrent callbacks only once', async () => {
  const s = await setup(),
    denied = await begin(s.login);
  await expect(s.login.finish(denied.state, denied.browser)).rejects.toThrow(
    'not completed',
  );
  await expect(
    s.login.finish(denied.state, denied.browser, 'code'),
  ).rejects.toThrow('Start');
  const start = await begin(s.login);
  const results = await Promise.allSettled([
    s.login.finish(start.state, start.browser, 'code'),
    s.login.finish(start.state, start.browser, 'code'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(s.calls.filter((r) => r.url.endsWith('access_token'))).toHaveLength(1);
});
it('rejects an unmapped GitHub identity without creating an account or a session', async () => {
  const s = await setup(),
    start = await begin(s.login);
  s.setProviderId(99999);
  await expect(
    s.login.finish(start.state, start.browser, 'code'),
  ).rejects.toThrow('needs an invitation');
  expect(await s.db.list('sessions', z.unknown())).toEqual([]);
  expect(await s.db.list('owners', z.unknown())).toHaveLength(1);
});
it('fails closed on provider errors without echoing secrets and cannot retry a consumed callback', async () => {
  const s = await setup();
  vi.mocked(s.provider).mockRejectedValue(
    new Error('synthetic-secret must not leak'),
  );
  const start = await begin(s.login);
  await expect(
    s.login.finish(start.state, start.browser, 'code'),
  ).rejects.toThrow('GitHub sign-in could not be verified. Start again.');
  await expect(
    s.login.finish(start.state, start.browser, 'code'),
  ).rejects.toThrow('Start GitHub');
  expect(await s.db.list('sessions', z.unknown())).toEqual([]);
});
it('rejects external return addresses and ambiguous or partial configuration', async () => {
  const s = await setup();
  for (const target of [
    'https://evil.example',
    '//evil.example',
    '/connections?next=https://evil.example',
    '/connect/consent?request=x&redirect=evil',
  ])
    await expect(s.login.start(target)).rejects.toThrow();
  expect(await s.db.list('github-login', z.unknown())).toEqual([]);
  expect(githubConfig({})).toBeUndefined();
  expect(() =>
    githubConfig({ MEDKIT_GITHUB_CLIENT_SECRET: 'sensitive-value' }),
  ).toThrow('Configure GitHub');
  const env = {
    MEDKIT_GITHUB_CLIENT_ID: 'test',
    MEDKIT_GITHUB_CLIENT_SECRET: 'synthetic-secret',
    MEDKIT_GITHUB_ACCOUNTS_JSON: JSON.stringify(s.config.accounts),
  };
  expect(githubConfig(env)?.accounts).toEqual(s.config.accounts);
  expect(() =>
    githubConfig({
      ...env,
      MEDKIT_GITHUB_ACCOUNTS_JSON: JSON.stringify([
        ...s.config.accounts,
        ...s.config.accounts,
      ]),
    }),
  ).toThrow();
});
it('rejects provider redirects instead of forwarding credentials', async () => {
  const s = await setup();
  vi.mocked(s.provider).mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { Location: 'https://evil.example' },
    }),
  );
  const start = await begin(s.login);
  await expect(
    s.login.finish(start.state, start.browser, 'code'),
  ).rejects.toThrow('could not be verified');
  expect(s.provider).toHaveBeenCalledTimes(1);
  expect(vi.mocked(s.provider).mock.calls[0]![1]?.redirect).toBe('manual');
  expect(await s.db.list('sessions', z.unknown())).toEqual([]);
});
it('enforces HTTP origin, browser cookie, callback replay and safe return to MCP consent', async () => {
  const s = await setup();
  let app: Express;
  const server = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  app = createServerApp({
    db: s.db,
    baseUrl: base,
    clients: [],
    github: s.config,
    githubFetch: s.provider,
  }).app;
  const start = (origin: string, returnTo = '/connections') =>
    fetch(base + '/api/login/github', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo }),
      redirect: 'manual',
    });
  expect((await start('https://evil.example')).status).toBe(403);
  const response = await start(
    base,
    '/connect/consent?request=synthetic-request',
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('set-cookie')).toContain('SameSite=Lax');
  const browserCookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const url = new URL(
    ((await response.json()) as { authorizationUrl: string }).authorizationUrl,
  );
  const callback =
    base +
    '/api/login/github/callback?' +
    new URLSearchParams({
      state: url.searchParams.get('state')!,
      code: 'synthetic-code',
    });
  const wrongBrowser = await fetch(callback, { redirect: 'manual' });
  expect(wrongBrowser.headers.get('location')).toBe(
    base + '/connections?signin=failed',
  );
  expect(s.calls).toHaveLength(0);
  const result = await fetch(callback, {
    headers: { Cookie: browserCookie },
    redirect: 'manual',
  });
  expect(result.status).toBe(303);
  expect(result.headers.get('location')).toBe(
    base + '/connect/consent?request=synthetic-request',
  );
  const sessionCookie = result.headers
    .getSetCookie()
    .find((c) => c.startsWith('medkit_session='))!
    .split(';')[0]!;
  const session = await fetch(base + '/api/session', {
    headers: { Cookie: sessionCookie },
  });
  expect(await session.json()).toEqual({ subject: s.account.subject });
  const replay = await fetch(callback, {
    headers: { Cookie: browserCookie },
    redirect: 'manual',
  });
  expect(replay.headers.get('location')).toBe(
    base + '/connections?signin=failed',
  );
  expect(
    replay.headers.getSetCookie().some((c) => c.startsWith('medkit_session=')),
  ).toBe(false);
});
