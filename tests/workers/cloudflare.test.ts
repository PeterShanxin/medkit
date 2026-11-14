import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openD1 } from '../../integrations/cloudflare/d1';
import { Identity } from '../../integrations/server/identity';
import { Records } from '../../integrations/server/records';
import { connectionScopes } from '../../src/application/connected/contracts';
import { fixture, now } from '../fixtures';
import { z } from 'zod';

const base = 'http://127.0.0.1:8787';
let mf: Miniflare;
let runtimeOptions: ConstructorParameters<typeof Miniflare>[0];
let directory: string;
let db: ReturnType<typeof openD1>;
let account: Awaited<ReturnType<Identity['provision']>>;
let second: typeof account;
let cookie: string;
const f = fixture();
const fetchWorker: typeof fetch = async (input, init) => {
  const r = await mf.dispatchFetch(String(input), {
    method: init?.method,
    headers: Object.fromEntries(new Headers(init?.headers)),
    body: init?.body as string | URLSearchParams | undefined,
    redirect: 'manual',
  });
  return new Response(await r.arrayBuffer(), {
    status: r.status,
    headers: Object.fromEntries(r.headers),
  });
};
async function request(
  route: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return fetchWorker(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined
        ? {}
        : { Origin: base, 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function exchange(fields: Record<string, string>) {
  return fetchWorker(base + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'test-client',
      resource: base + '/mcp',
      ...fields,
    }),
  });
}
async function authorize(key = account.key) {
  const verifier = 'v'.repeat(64);
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: 'test-client',
    redirect_uri: 'http://127.0.0.1/callback',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: connectionScopes.join(' '),
    resource: base + '/mcp',
  });
  const start = await request('/authorize?' + query);
  expect(start.status, await start.clone().text()).toBe(302);
  const location = start.headers.get('location')!;
  const consent = await request(location);
  expect(consent.status).toBe(200);
  expect(await consent.text()).toContain('Connect Synthetic client');
  const approved = await request('/connect/approve', {
    request: new URL(location, base).searchParams.get('request'),
    key,
    decision: 'allow',
    allowWrite: 'yes',
  });
  expect(approved.status).toBe(303);
  return {
    grant_type: 'authorization_code',
    code: new URL(approved.headers.get('location')!).searchParams.get('code')!,
    code_verifier: verifier,
    redirect_uri: 'http://127.0.0.1/callback',
  };
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'medkit-d1-test-'));
  runtimeOptions = convertV4MiniflareOptions({
    name: 'medkit',
    host: '127.0.0.1',
    modules: true,
    scriptPath: '.wrangler/build/worker.js',
    compatibilityDate: '2026-11-14',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      MEDKIT_BASE_URL: base,
      MEDKIT_OAUTH_CLIENTS_JSON: JSON.stringify([
        {
          client_id: 'test-client',
          client_name: 'Synthetic client',
          redirect_uris: ['http://127.0.0.1/callback'],
        },
      ]),
    },
    d1Databases: ['DB'],
    ratelimits: {
      REQUEST_LIMIT: {
        namespace_id: '18431',
        simple: { limit: 300, period: 60 },
      },
      LOGIN_LIMIT: {
        namespace_id: '18432',
        simple: { limit: 10, period: 60 },
      },
    },
    assets: {
      directory: 'dist',
      binding: 'ASSETS',
      run_worker_first: true,
      routerConfig: { has_user_worker: true },
      assetConfig: { html_handling: 'none' },
    },
  });
  runtimeOptions.resourcePersistencePath = directory;
  mf = new Miniflare(runtimeOptions);
  const sql = await mf.getD1Database('DB');
  const schema = await readFile(
    'integrations/cloudflare/migrations/0001_entries.sql',
    'utf8',
  );
  await sql.exec(schema.replaceAll('\n', ' '));
  db = openD1(sql);
  account = await new Identity(db).provision();
  second = await new Identity(db).provision();
  await new Records(db).import(account.subject, {
    format: 'medkit',
    exportedAt: now,
    state: f.state,
  });
  const login = await request('/api/login', { key: account.key });
  expect(login.status, await login.clone().text()).toBe(200);
  cookie = login.headers.get('set-cookie')!.split(';')[0]!;
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('serves the built app and keeps private routes out of static fallback', async () => {
  expect((await request('/cabinet')).status).toBe(200);
  expect((await request('/api/records')).status).toBe(401);
  expect((await request('/api/missing')).status).toBe(404);
  expect(
    (
      await request('/api/records', undefined, {
        Origin: 'https://untrusted.invalid',
      })
    ).status,
  ).toBe(403);
  expect(
    (await request('/api/records', undefined, { Cookie: cookie })).status,
  ).toBe(200);
});
it('runs OAuth and real SDK MCP prepare, concurrent owner confirmation, readback and revocation on D1', async () => {
  const tokenResponse = await exchange(await authorize());
  expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200);
  const token = (await tokenResponse.json()) as { access_token: string };
  const client = new Client({ name: 'synthetic-d1-client', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        fetch: fetchWorker,
        requestInit: {
          headers: { Authorization: `Bearer ${token.access_token}` },
        },
      }),
    );
    const proposed = await client.callTool({
      name: 'prepare_record_change',
      arguments: {
        requestId: randomUUID(),
        userStatement: 'I took one tablet.',
        change: { kind: 'record_dose', dose: f.dose().data },
      },
    });
    expect(proposed.isError, JSON.stringify(proposed)).not.toBe(true);
    const result = proposed.structuredContent as {
      review: { id: string };
      recorded: boolean;
    };
    expect(result.recorded).toBe(false);
    expect((await db.records(account.subject)).state.doses).toHaveLength(0);
    expect(
      (
        await request(
          '/api/reviews/' + result.review.id,
          { approve: true },
          { Authorization: `Bearer ${token.access_token}` },
        )
      ).status,
    ).toBe(401);
    const confirmations = await Promise.all(
      [1, 2].map(() =>
        request(
          '/api/reviews/' + result.review.id,
          { approve: true },
          { Cookie: cookie },
        ),
      ),
    );
    expect(confirmations.map((r) => r.status)).toEqual([200, 200]);
    expect((await db.records(account.subject)).state.batches[0]!.quantity).toBe(
      9,
    );
    expect((await db.records(account.subject)).state.doses).toHaveLength(1);
    expect((await db.records(second.subject)).state.doses).toHaveLength(0);
    const doses = await client.callTool({
      name: 'get_recent_doses',
      arguments: {},
    });
    expect(doses.isError).not.toBe(true);
    const grants = (await (
      await request('/api/connections', undefined, { Cookie: cookie })
    ).json()) as { id: string }[];
    expect(
      (
        await request(
          '/api/connections/' + grants[0]!.id + '/revoke',
          {},
          { Cookie: cookie },
        )
      ).status,
    ).toBe(200);
    await expect(
      client.callTool({ name: 'get_recent_doses', arguments: {} }),
    ).rejects.toThrow();
  } finally {
    await client.close();
  }
}, 30_000);
it('redeems a code once and revokes a connection after concurrent refresh replay', async () => {
  const code = await authorize();
  const responses = await Promise.all([exchange(code), exchange(code)]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  const issued = (await responses.find((r) => r.status === 200)!.json()) as {
    refresh_token: string;
  };
  const refresh = {
    grant_type: 'refresh_token',
    refresh_token: issued.refresh_token,
  };
  const refreshed = await Promise.all([exchange(refresh), exchange(refresh)]);
  expect(refreshed.map((r) => r.status).sort()).toEqual([200, 400]);
  const access = (await refreshed.find((r) => r.status === 200)!.json()) as {
    access_token: string;
  };
  expect(
    (
      await request(
        '/mcp',
        {},
        { Authorization: `Bearer ${access.access_token}` },
      )
    ).status,
  ).toBe(401);
}, 30_000);
it('rolls back every staged write on failure and retries an authorization change before commit', async () => {
  const schema = z.object({ value: z.number() });
  await db.put('synthetic', 'counter', { value: 0 });
  await expect(
    db.atomic(async () => {
      await db.put('synthetic', 'counter', { value: 100 });
      throw new Error('synthetic failure');
    }),
  ).rejects.toThrow('synthetic failure');
  expect(await db.get('synthetic', 'counter', schema)).toEqual({ value: 0 });
  await Promise.all(
    [1, 2].map(() =>
      db.atomic(async () => {
        const previous = await db.get('synthetic', 'counter', schema);
        await db.put('synthetic', 'counter', { value: previous!.value + 1 });
      }),
    ),
  );
  expect(await db.get('synthetic', 'counter', schema)).toEqual({ value: 2 });
  const sql = await mf.getD1Database('DB');
  expect(
    await sql
      .prepare('SELECT count(*) AS count FROM transaction_guard')
      .first('count'),
  ).toBe(0);
  await db.delete('synthetic');
});
it('rechecks revoked authorization after a conflicting commit and never saves the pending change', async () => {
  const sql = await mf.getD1Database('DB'),
    other = openD1(sql);
  const schema = z.object({ revoked: z.boolean() });
  await db.put('synthetic', 'grant', { revoked: false });
  let observed!: () => void, resume!: () => void;
  const read = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const pending = db.atomic(async () => {
    if ((await db.get('synthetic', 'grant', schema))!.revoked)
      throw new Error('Access revoked');
    observed();
    await gate;
    await db.put('synthetic', 'forbidden', { value: 1 });
  });
  const denied = expect(pending).rejects.toThrow('Access revoked');
  await read;
  await other.put('synthetic', 'grant', { revoked: true });
  resume();
  await denied;
  expect(await db.get('synthetic', 'forbidden', z.unknown())).toBeNull();
  await db.delete('synthetic');
});
it('deletes a long history atomically without one D1 statement per entry', async () => {
  for (let i = 0; i < 60; i++)
    await db.put('synthetic', String(i), { value: i });
  await db.delete('synthetic');
  expect(await db.list('synthetic', z.unknown())).toEqual([]);
});

it('retains account, session, dose and stock across a Worker runtime restart', async () => {
  await mf.dispose();
  mf = new Miniflare(runtimeOptions);
  const response = await request('/api/records', undefined, { Cookie: cookie });
  expect(response.status, await response.clone().text()).toBe(200);
  const data = (await response.json()) as {
    state: { doses: unknown[]; batches: { quantity: number }[] };
  };
  expect(data.state.doses).toHaveLength(1);
  expect(data.state.batches[0]!.quantity).toBe(9);
});
