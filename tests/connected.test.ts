import { openDatabase } from '../integrations/server/sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServerApp } from '../integrations/server/app';
import { Identity } from '../integrations/server/identity';
import { Records } from '../integrations/server/records';
import { fixture, now, medicineInput } from './fixtures';
import {
  connectionScopes,
  type ProposalInput,
} from '../src/application/connected/contracts';
import { emptyState } from '../src/domain/model';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
async function setup() {
  const db = openDatabase(':memory:');
  cleanup.push(() => db.close());
  let app: Express;
  const listener = createServer((req, res) => app(req, res));
  await new Promise<void>((resolve) =>
    listener.listen(0, '127.0.0.1', resolve),
  );
  cleanup.push(
    () => new Promise<void>((resolve) => listener.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  const services = createServerApp({
    db,
    baseUrl: base,
    clients: [
      {
        client_id: 'test-client',
        client_name: 'Synthetic AI client',
        redirect_uris: ['http://127.0.0.1/callback'],
      },
    ],
  });
  app = services.app;
  const a = await services.identity.provision(),
    b = await services.identity.provision();
  const f = fixture();
  await services.records.import(a.subject, {
    format: 'medkit',
    exportedAt: now,
    state: f.state,
  });
  async function request(
    route: string,
    body?: unknown,
    options: { cookie?: string; token?: string; origin?: string } = {},
  ) {
    return fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined
          ? {}
          : {
              'Content-Type': 'application/json',
              Origin: options.origin ?? base,
            }),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'manual',
    });
  }
  async function login(key = a.key) {
    const res = await request('/api/login', { key });
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie')!.split(';')[0]!;
  }
  async function authorization(
    scopes: readonly string[] = connectionScopes,
    key = a.key,
    write = true,
  ) {
    const verifier = 'v'.repeat(64);
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'http://127.0.0.1/callback',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: scopes.join(' '),
      resource: base + '/mcp',
      state: 'test-state',
    });
    const start = await fetch(base + '/authorize?' + query, {
      redirect: 'manual',
    });
    expect(start.status).toBe(302);
    const location = start.headers.get('location')!;
    const pending = new URL(location, base).searchParams.get('request')!;
    const approval = await request('/connect/approve', {
      request: pending,
      key,
      decision: 'allow',
      ...(write ? { allowWrite: 'yes' } : {}),
    });
    expect(approval.status).toBe(303);
    const callback = new URL(approval.headers.get('location')!);
    expect(callback.searchParams.get('state')).toBe('test-state');
    return { code: callback.searchParams.get('code')!, verifier };
  }
  async function exchange(fields: Record<string, string>) {
    return fetch(base + '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'test-client',
        resource: base + '/mcp',
        ...fields,
      }),
    });
  }
  async function tokens(
    scopes: readonly string[] = connectionScopes,
    key = a.key,
    write = true,
  ) {
    const c = await authorization(scopes, key, write);
    const r = await exchange({
      grant_type: 'authorization_code',
      code: c.code,
      code_verifier: c.verifier,
      redirect_uri: 'http://127.0.0.1/callback',
    });
    expect(r.status, await r.clone().text()).toBe(200);
    return (await r.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
    };
  }
  async function client(token: string) {
    const client = new Client({ name: 'medkit-synthetic-test', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    cleanup.push(() => client.close());
    return client;
  }
  const input = (): ProposalInput => ({
    requestId: randomUUID(),
    userStatement: 'I took one tablet at the recorded time.',
    change: { kind: 'record_dose', dose: f.dose().data },
  });
  return {
    db,
    base,
    ...services,
    a,
    b,
    f,
    request,
    login,
    authorization,
    exchange,
    tokens,
    client,
    input,
  };
}

describe('connected record integrity', () => {
  it('persists approved dose and stock atomically across a database restart', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'medkit-connected-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'records.sqlite');
    let db = openDatabase(file);
    const { subject } = await new Identity(db).provision();
    const f = fixture();
    const records = new Records(db, () => now);
    await records.import(subject, {
      format: 'medkit',
      exportedAt: now,
      state: f.state,
    });
    const proposal = await records.propose(subject, randomUUID(), 'Test', {
      requestId: randomUUID(),
      userStatement: 'I took a tablet.',
      change: { kind: 'record_dose', dose: f.dose().data },
    });
    expect((await db.records(subject)).state.doses).toHaveLength(0);
    await records.decide(subject, proposal.id, true, () => {});
    await records.decide(subject, proposal.id, true, () => {});
    db.close();
    db = openDatabase(file);
    cleanup.push(() => db.close());
    expect((await db.records(subject)).state.doses).toHaveLength(1);
    expect((await db.records(subject)).state.batches[0]!.quantity).toBe(9);
  });
  it('checks versions, payload-bound idempotency, invalid units and failed writes', async () => {
    const s = await setup();
    const version = (await s.db.records(s.a.subject)).version;
    const mutation = {
      operationId: randomUUID(),
      commands: [s.f.dose()],
      version,
    };
    await s.records.execute(s.a.subject, mutation);
    await s.records.execute(s.a.subject, mutation);
    expect((await s.db.records(s.a.subject)).state.batches[0]!.quantity).toBe(
      9,
    );
    await expect(
      async () =>
        await s.records.execute(s.a.subject, {
          ...mutation,
          commands: [s.f.dose(2)],
        }),
    ).rejects.toThrow('different change');
    await expect(
      async () =>
        await s.records.execute(s.a.subject, {
          ...mutation,
          operationId: randomUUID(),
        }),
    ).rejects.toThrow('Records changed');
    const bad = s.f.dose();
    bad.data.unit = 'mL';
    await expect(
      async () =>
        await s.records.execute(s.a.subject, {
          operationId: randomUUID(),
          commands: [bad],
          version: version + 1,
        }),
    ).rejects.toThrow('unit');
    expect((await s.db.records(s.a.subject)).state.doses).toHaveLength(1);
  });
  it('supports medicine, batches, symptoms, recovery and visible dose corrections through shared transitions', async () => {
    const s = await setup();
    const grant = randomUUID();
    async function apply(change: ProposalInput['change']) {
      const p = await s.records.propose(s.a.subject, grant, 'Test', {
        requestId: randomUUID(),
        userStatement: 'Explicit synthetic owner request',
        change,
      });
      await s.records.decide(s.a.subject, p.id, true, () => {});
      return (await s.db.records(s.a.subject)).state;
    }
    const state = await apply({
      kind: 'add_medicine',
      medicine: medicineInput,
      batch: {
        quantity: 3,
        expiresOn: null,
        acquiredOn: null,
        location: 'Shelf',
        lowStockAt: 1,
      },
    });
    expect(state.medicines[1]!.labelChecked).toBe(false);
    const symptoms = [
      { symptom: 'Cough', severity: 'mild' as const, at: now, notes: '' },
    ];
    let updated = await apply({
      kind: 'start_episode',
      episode: { title: 'Respiratory symptoms', onsetAt: now, notes: '' },
      symptoms,
    });
    const episodeId = updated.episodes[0]!.id;
    updated = await apply({
      kind: 'record_symptom',
      observation: { ...symptoms[0]!, episodeId },
    });
    expect(updated.observations).toHaveLength(2);
    updated = await apply({
      kind: 'record_dose',
      dose: { ...s.f.dose().data, episodeId },
    });
    updated = await apply({
      kind: 'void_dose',
      doseId: updated.doses[0]!.id,
      reason: 'Duplicate report',
      returnStock: true,
    });
    expect(updated.doses[0]!.voidedAt).not.toBeNull();
    expect(updated.batches[0]!.quantity).toBe(10);
    updated = await apply({ kind: 'resolve_episode', episodeId, at: now });
    expect(updated.episodes[0]!.resolvedAt).toBe(now);
    updated = await apply({
      kind: 'adjust_stock',
      batchId: s.f.batchId,
      quantity: 5,
      reason: 'Counted stock',
    });
    expect(updated.batches[0]!.quantity).toBe(5);
    updated = await apply({
      kind: 'add_batch',
      batch: {
        medicineId: s.f.medicineId,
        quantity: 2,
        expiresOn: null,
        acquiredOn: null,
        location: 'Bag',
        lowStockAt: 1,
      },
    });
    expect(updated.batches).toHaveLength(3);
  });
});

it('rolls back stock and proposal status when the commit audit fails', async () => {
  const s = await setup();
  const p = await s.records.propose(
    s.a.subject,
    randomUUID(),
    'Test',
    s.input(),
  );
  const spy = vi.spyOn(s.db, 'audit').mockImplementationOnce(() => {
    throw new Error('Disk write failed');
  });
  await expect(
    async () => await s.records.decide(s.a.subject, p.id, true, () => {}),
  ).rejects.toThrow('Disk write failed');
  spy.mockRestore();
  expect((await s.db.records(s.a.subject)).state.doses).toHaveLength(0);
  expect((await s.db.records(s.a.subject)).state.batches[0]!.quantity).toBe(10);
  expect((await s.records.list(s.a.subject))[0]!.status).toBe('pending');
});

describe('OAuth and HTTP MCP', () => {
  it('exposes discovery, requires authentication and rejects hostile origins and callbacks', async () => {
    const s = await setup();
    const metadata = await (
      await fetch(s.base + '/.well-known/oauth-protected-resource/mcp')
    ).json();
    expect(metadata.resource).toBe(s.base + '/mcp');
    const auth = await (
      await fetch(s.base + '/.well-known/oauth-authorization-server')
    ).json();
    expect(auth.code_challenge_methods_supported).toContain('S256');
    const noAuth = await s.request('/mcp', {});
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get('www-authenticate')).toContain(
      'resource_metadata',
    );
    expect(
      (
        await s.request(
          '/api/login',
          { key: s.a.key },
          { origin: 'https://attacker.invalid' },
        )
      ).status,
    ).toBe(403);
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: 'test-client',
      redirect_uri: 'https://attacker.invalid/callback',
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'S256',
      resource: s.base + '/mcp',
    });
    expect(
      (await fetch(s.base + '/authorize?' + q, { redirect: 'manual' })).status,
    ).toBe(400);
  });
  it('binds authorization codes to PKCE, callback and resource, and prevents code replay', async () => {
    const s = await setup();
    const c = await s.authorization();
    const fields = {
      grant_type: 'authorization_code',
      code: c.code,
      code_verifier: c.verifier,
      redirect_uri: 'http://127.0.0.1/callback',
    };
    expect(
      (await s.exchange({ ...fields, code_verifier: 'wrong'.repeat(12) }))
        .status,
    ).toBe(400);
    expect(
      (
        await s.exchange({
          ...fields,
          resource: 'https://attacker.invalid/mcp',
        })
      ).status,
    ).toBe(400);
    expect((await s.exchange(fields)).status).toBe(200);
    expect((await s.exchange(fields)).status).toBe(400);
  });
  it('invalidates unexchanged codes on record deletion without revoking another account', async () => {
    const s = await setup();
    const deleted = await s.authorization();
    const other = await s.authorization(connectionScopes, s.b.key);
    const cookie = await s.login();
    const erased = await s.request(
      '/api/erase',
      { version: (await s.db.records(s.a.subject)).version },
      { cookie },
    );
    expect(erased.status).toBe(200);
    const fields = (c: typeof deleted) => ({
      grant_type: 'authorization_code',
      code: c.code,
      code_verifier: c.verifier,
      redirect_uri: 'http://127.0.0.1/callback',
    });
    expect((await s.exchange(fields(deleted))).status).toBe(400);
    expect((await s.exchange(fields(other))).status).toBe(200);
    expect(await s.oauth.list(s.a.subject)).toHaveLength(0);
    const fresh = await s.authorization();
    expect((await s.exchange(fields(fresh))).status).toBe(200);
  });
  it('runs real HTTP MCP prepare, owner confirmation, status, and readback without duplicate deductions', async () => {
    const s = await setup();
    const tokens = await s.tokens();
    const client = await s.client(tokens.access_token);
    const cookie = await s.login();
    const input = s.input();
    const prepared = await client.callTool({
      name: 'prepare_record_change',
      arguments: input,
    });
    expect(prepared.isError).not.toBe(true);
    const p = prepared.structuredContent as {
      review: { id: string; status: string };
      recorded: boolean;
    };
    expect(p.review.status).toBe('pending');
    expect(p.recorded).toBe(false);
    expect((await s.db.records(s.a.subject)).state.doses).toHaveLength(0);
    const duplicate = await client.callTool({
      name: 'prepare_record_change',
      arguments: input,
    });
    expect((duplicate.structuredContent as typeof p).review.id).toBe(
      p.review.id,
    );
    expect(
      (
        await s.request(
          `/api/reviews/${p.review.id}`,
          { approve: true },
          { token: tokens.access_token },
        )
      ).status,
    ).toBe(401);
    const other = await s.login(s.b.key);
    expect(
      (
        await s.request(
          `/api/reviews/${p.review.id}`,
          { approve: true },
          { cookie: other },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await s.request(
          `/api/reviews/${p.review.id}`,
          { approve: true },
          { cookie },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await s.request(
          `/api/reviews/${p.review.id}`,
          { approve: true },
          { cookie },
        )
      ).status,
    ).toBe(200);
    const status = await client.callTool({
      name: 'get_record_change_status',
      arguments: { id: p.review.id },
    });
    expect((status.structuredContent as typeof p).recorded).toBe(true);
    const doses = await client.callTool({
      name: 'get_recent_doses',
      arguments: {},
    });
    expect((doses.structuredContent as { data: unknown[] }).data).toHaveLength(
      1,
    );
    expect((await s.db.records(s.a.subject)).state.batches[0]!.quantity).toBe(
      9,
    );
    expect(
      (await (await s.request('/api/records', undefined, { cookie })).json())
        .state.doses,
    ).toHaveLength(1);
  });
  it('enforces read scopes, separate write consent, per-account isolation and revocation', async () => {
    const s = await setup();
    const read = await s.tokens(['cabinet:read']);
    const client = await s.client(read.access_token);
    expect(
      (await client.callTool({ name: 'get_recent_doses', arguments: {} }))
        .isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: 'prepare_record_change',
          arguments: s.input(),
        })
      ).isError,
    ).toBe(true);
    const declined = await s.tokens(connectionScopes, s.a.key, false);
    expect(declined.scope).not.toContain('records:write');
    const other = await s.client(
      (await s.tokens(connectionScopes, s.b.key)).access_token,
    );
    expect(
      (await other.callTool({ name: 'list_medicines', arguments: {} }))
        .structuredContent,
    ).toMatchObject({ data: [] });
    const cookie = await s.login();
    const connection = await s.oauth.access(read.access_token);
    expect(
      (
        await s.request(
          `/api/connections/${connection.id}/revoke`,
          {},
          { cookie: await s.login(s.b.key) },
        )
      ).status,
    ).toBe(404);
    await s.request(`/api/connections/${connection.id}/revoke`, {}, { cookie });
    await expect(
      client.callTool({ name: 'list_medicines', arguments: {} }),
    ).rejects.toThrow();
  });
  it('rotates refresh tokens, rejects scope escalation and revokes the grant on refresh replay', async () => {
    const s = await setup();
    const first = await s.tokens(['cabinet:read']);
    expect(
      (
        await s.exchange({
          grant_type: 'refresh_token',
          refresh_token: first.refresh_token,
          scope: 'records:write',
        })
      ).status,
    ).toBe(400);
    const refreshed = await s.exchange({
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
    });
    expect(refreshed.status).toBe(200);
    const second = await refreshed.json();
    expect(
      (
        await s.exchange({
          grant_type: 'refresh_token',
          refresh_token: first.refresh_token,
        })
      ).status,
    ).toBe(400);
    await expect(
      async () => await s.oauth.access(second.access_token),
    ).rejects.toThrow();
  });
  it('rejects stale, expired and revoked proposals, and deletes records while revoking clients', async () => {
    const s = await setup();
    const token = await s.tokens();
    const grant = await s.oauth.access(token.access_token);
    const p = await s.records.propose(
      s.a.subject,
      grant.id,
      grant.clientName,
      s.input(),
    );
    const current = await s.db.records(s.a.subject);
    await s.records.execute(s.a.subject, {
      operationId: randomUUID(),
      commands: [s.f.dose()],
      version: current.version,
    });
    await expect(
      async () => await s.records.decide(s.a.subject, p.id, true, () => {}),
    ).rejects.toThrow('expired or records changed');
    const late = new Records(s.db, () =>
      new Date(Date.now() + 11 * 60_000).toISOString(),
    );
    const fresh = await s.records.propose(
      s.a.subject,
      grant.id,
      grant.clientName,
      s.input(),
    );
    await expect(
      async () => await late.decide(s.a.subject, fresh.id, true, () => {}),
    ).rejects.toThrow('expired');
    const cookie = await s.login();
    const response = await s.request(
      '/api/erase',
      { version: (await s.db.records(s.a.subject)).version },
      { cookie },
    );
    expect(response.status).toBe(200);
    expect((await s.db.records(s.a.subject)).state.medicines).toHaveLength(0);
    expect(await s.records.list(s.a.subject)).toHaveLength(0);
    await expect(
      async () => await s.oauth.access(token.access_token),
    ).rejects.toThrow();
  });
  it('does not overwrite an existing connected space or import demo records', async () => {
    const s = await setup();
    await expect(
      async () =>
        await s.records.import(s.a.subject, {
          format: 'medkit',
          exportedAt: now,
          state: s.f.state,
        }),
    ).rejects.toThrow('cannot overwrite');
    await expect(
      async () =>
        await s.records.import(s.b.subject, {
          format: 'medkit',
          exportedAt: now,
          state: emptyState(randomUUID(), 'demo'),
        }),
    ).rejects.toThrow('Sample data');
  });
});

it('rejects pending requests when their external grant is revoked', async () => {
  const s = await setup();
  const token = await s.tokens();
  const grant = await s.oauth.access(token.access_token);
  const proposal = await s.records.propose(
    s.a.subject,
    grant.id,
    grant.clientName,
    s.input(),
  );
  const cookie = await s.login();
  await s.request(`/api/connections/${grant.id}/revoke`, {}, { cookie });
  expect(
    (await s.records.list(s.a.subject)).find((p) => p.id === proposal.id)
      ?.status,
  ).toBe('rejected');
  expect(
    (
      await s.request(
        `/api/reviews/${proposal.id}`,
        { approve: true },
        { cookie },
      )
    ).status,
  ).toBe(409);
});

it('does not expose proposal details through a refresh token with reduced read permissions', async () => {
  const s = await setup();
  const full = await s.tokens();
  const grant = await s.oauth.access(full.access_token);
  const proposal = await s.records.propose(
    s.a.subject,
    grant.id,
    grant.clientName,
    s.input(),
  );
  const response = await s.exchange({
    grant_type: 'refresh_token',
    refresh_token: full.refresh_token,
    scope: 'records:write',
  });
  expect(response.status).toBe(200);
  const token = await response.json();
  const client = await s.client(token.access_token);
  expect(
    (
      await client.callTool({
        name: 'get_record_change_status',
        arguments: { id: proposal.id },
      })
    ).isError,
  ).toBe(true);
});
