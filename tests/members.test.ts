import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import { openDatabase } from '../integrations/server/sqlite';
import { Identity } from '../integrations/server/identity';
import { Members } from '../integrations/server/members';
import { createServerApp } from '../integrations/server/app';
import { medicineInput } from './fixtures';
import { connectionScopes } from '../src/application/connected/contracts';
import { ConnectedService } from '../src/storage/connected-client';
import type { State } from '../src/domain/model';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const clean of cleanups.splice(0).reverse()) await clean();
});
async function setup() {
  const db = openDatabase(':memory:');
  cleanups.push(() => db.close());
  const identity = new Identity(db),
    admin = await identity.provision();
  const config = {
    clientId: 'synthetic',
    clientSecret: 'synthetic',
    accounts: [{ githubId: '111', subject: admin.subject, admin: true }],
  };
  const members = new Members(db, config);
  let app: Express;
  const server = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const services = createServerApp({
    db,
    baseUrl: base,
    github: config,
    githubFetch: async () =>
      Response.json({ id: 222, login: 'synthetic-guest', type: 'User' }),
    clients: [
      {
        client_id: 'test-client',
        client_name: 'Synthetic AI',
        redirect_uris: ['http://127.0.0.1/callback'],
      },
    ],
  });
  app = services.app;
  const adminSession = await identity.login(admin.key);
  async function request(
    route: string,
    token?: string,
    body?: unknown,
    expected?: string,
  ) {
    return fetch(base + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: `medkit_session=${token ?? ''}`,
        Origin: base,
        'Content-Type': 'application/json',
        ...(expected ? { 'X-MedKit-Account': expected } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function guest(id = '222') {
    await members.invite(admin.subject, { githubId: id, login: `guest-${id}` });
    return members.login(id, identity);
  }
  return {
    db,
    identity,
    admin,
    config,
    members,
    base,
    services,
    adminSession,
    request,
    guest,
  };
}
it('creates one private space on concurrent first sign-in and keeps each invited person separate', async () => {
  const s = await setup();
  await s.members.invite(s.admin.subject, {
    githubId: '222',
    login: 'synthetic-guest',
  });
  expect(await s.db.list('records', z.unknown())).toHaveLength(1);
  const sessions = await Promise.all([
    s.members.login('222', s.identity),
    s.members.login('222', s.identity),
  ]);
  expect(sessions[0]!.subject).toBe(sessions[1]!.subject);
  expect(sessions[0]!.subject).not.toBe(s.admin.subject);
  const other = await s.guest('333');
  expect(other.subject).not.toBe(sessions[0]!.subject);
  expect(await s.db.list('records', z.unknown())).toHaveLength(3);
  expect(await s.db.list('owners', z.unknown())).toHaveLength(1);
  expect((await s.db.records(other.subject)).state.medicines).toHaveLength(0);
  expect(s.members.isAdmin(other.subject)).toBe(false);
  expect(await s.members.list(s.admin.subject)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ githubId: '222', status: 'active' }),
    ]),
  );
  expect(JSON.stringify(await s.members.list(s.admin.subject))).not.toContain(
    'subject',
  );
});
it('denies uninvited users and ordinary members access to host actions', async () => {
  const s = await setup(),
    guest = await s.guest();
  await expect(s.members.login('999', s.identity)).rejects.toThrow(
    'invitation',
  );
  await expect(
    s.members.invite(guest.subject, { githubId: '999', login: 'outsider' }),
  ).rejects.toThrow('Only the host');
  for (const [route, body] of [
    ['members', undefined],
    ['members/lookup', { username: 'synthetic-guest' }],
    ['members', { githubId: '999', login: 'outsider' }],
    ['members/222/revoke', {}],
  ] as const)
    expect((await s.request(route, guest.token, body)).status).toBe(403);
  expect((await s.request('members')).status).toBe(401);
  expect(
    (
      await s.request('members', s.adminSession.token, {
        githubId: '333',
        login: 'synthetic-guest',
      })
    ).status,
  ).toBe(409);
  await expect(
    s.members.invite(s.admin.subject, { githubId: '111', login: 'host' }),
  ).rejects.toThrow('already configured');
  expect(await s.db.list('records', z.unknown())).toHaveLength(2);
});
it('binds old browser actions to the displayed account before changing records', async () => {
  const s = await setup(),
    a = await s.guest(),
    b = await s.guest('333');
  const change = {
    operationId: randomUUID(),
    version: 0,
    commands: [
      { type: 'medicine.save', id: randomUUID(), data: medicineInput },
    ],
  };
  const actualFetch = globalThis.fetch;
  let activeToken = a.token;
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) =>
    actualFetch(new URL(String(input), s.base), {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        Cookie: `medkit_session=${activeToken}`,
        Origin: s.base,
      },
    }),
  );
  let cached: State | null = null;
  const client = new ConnectedService(
    {
      read: async () => cached,
      transact: async (update) => (cached = update(cached)),
      clear: async () => {
        cached = null;
      },
      close: () => {},
    },
    a.subject,
  );
  await client.load();
  activeToken = b.token;
  await expect(
    client.execute({
      operationId: change.operationId,
      commands: change.commands as Parameters<
        ConnectedService['execute']
      >[0]['commands'],
    }),
  ).rejects.toThrow('account changed');
  vi.unstubAllGlobals();
  expect((await s.request('records', b.token, change, a.subject)).status).toBe(
    409,
  );
  expect(
    (await s.request('erase', b.token, { version: 0 }, a.subject)).status,
  ).toBe(409);
  expect((await s.db.records(b.subject)).state.medicines).toHaveLength(0);
  expect((await s.request('records', a.token, change, a.subject)).status).toBe(
    200,
  );
  expect((await s.db.records(a.subject)).state.medicines).toHaveLength(1);
  expect((await s.db.records(b.subject)).state.medicines).toHaveLength(0);
});
it('revokes browser sessions, actual OAuth tokens and pending reviews while retaining the original private records', async () => {
  const s = await setup(),
    a = await s.guest(),
    b = await s.guest('333');
  const verifier = 'v'.repeat(64);
  const authorize = await fetch(
    s.base +
      '/authorize?' +
      new URLSearchParams({
        response_type: 'code',
        client_id: 'test-client',
        redirect_uri: 'http://127.0.0.1/callback',
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
        scope: connectionScopes.join(' '),
        resource: s.base + '/mcp',
      }),
    { redirect: 'manual' },
  );
  const request = new URL(
    authorize.headers.get('location')!,
    s.base,
  ).searchParams.get('request')!;
  const consent = await fetch(
    new URL(authorize.headers.get('location')!, s.base),
    { headers: { Cookie: `medkit_session=${a.token}` } },
  );
  expect(await consent.text()).toContain(
    `name="expectedSubject" value="${a.subject}"`,
  );
  const staleConsent = await fetch(s.base + '/connect/approve', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: `medkit_session=${b.token}`,
      Origin: s.base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request,
      decision: 'allow',
      expectedSubject: a.subject,
    }),
  });
  expect(staleConsent.status).toBe(409);
  const approved = await fetch(s.base + '/connect/approve', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: `medkit_session=${a.token}`,
      Origin: s.base,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request, decision: 'allow', allowWrite: 'yes' }),
  });
  const code = new URL(approved.headers.get('location')!).searchParams.get(
    'code',
  )!;
  const exchange = await fetch(s.base + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'test-client',
      redirect_uri: 'http://127.0.0.1/callback',
      code,
      code_verifier: verifier,
      resource: s.base + '/mcp',
    }),
  });
  expect(exchange.status).toBe(200);
  const token = (await exchange.json()) as {
    access_token: string;
    refresh_token: string;
  };
  const grant = await s.services.oauth.access(token.access_token);
  const review = await s.services.records.propose(
    a.subject,
    grant.id,
    'Synthetic AI',
    {
      requestId: 'synthetic-invite-review',
      userStatement: 'Synthetic example only',
      change: {
        kind: 'add_medicine',
        medicine: medicineInput,
        batch: {
          quantity: 8,
          expiresOn: '2027-12-31',
          acquiredOn: null,
          location: '',
          lowStockAt: 2,
        },
      },
    },
  );
  const before = await s.db.records(a.subject);
  await s.members.revoke(
    s.admin.subject,
    '222',
    s.services.oauth,
    s.services.records,
  );
  await expect(s.identity.session(a.token)).rejects.toThrow('Sign in again');
  await expect(s.services.oauth.access(token.access_token)).rejects.toThrow();
  expect(
    (await s.services.records.list(a.subject)).find((r) => r.id === review.id)
      ?.status,
  ).toBe('rejected');
  await expect(s.members.login('222', s.identity)).rejects.toThrow(
    'invitation',
  );
  expect(await s.db.records(a.subject)).toEqual(before);
  expect(await s.identity.session(b.token)).toBe(b.subject);
  await s.members.invite(s.admin.subject, {
    githubId: '222',
    login: 'renamed-guest',
  });
  expect((await s.members.login('222', s.identity)).subject).toBe(a.subject);
  await expect(s.services.oauth.access(token.access_token)).rejects.toThrow();
});
it('cannot restore access when revocation races a login', async () => {
  const s = await setup();
  await s.guest();
  const results = await Promise.allSettled([
    s.members.login('222', s.identity),
    s.members.revoke(
      s.admin.subject,
      '222',
      s.services.oauth,
      s.services.records,
    ),
  ]);
  expect(results[1]!.status).toBe('fulfilled');
  if (results[0]!.status === 'fulfilled')
    await expect(s.identity.session(results[0]!.value.token)).rejects.toThrow();
  await expect(s.members.login('222', s.identity)).rejects.toThrow();
});
