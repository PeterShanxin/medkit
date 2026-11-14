import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { medicineInput } from './fixtures';

it('starts the deployment CLI, requires owner authentication, and retains records after restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'medkit-startup-'));
  const reserve = createServer();
  await new Promise<void>((r) => reserve.listen(0, '127.0.0.1', r));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const env = {
    ...process.env,
    MEDKIT_BASE_URL: '',
    RENDER_EXTERNAL_URL: 'https://synthetic.example',
    MEDKIT_DATABASE: path.join(directory, 'records.sqlite'),
    MEDKIT_OAUTH_CLIENTS_JSON: '[]',
    MEDKIT_BIND_HOST: '0.0.0.0',
    PORT: String(port),
  };
  delete (env as NodeJS.ProcessEnv).MEDKIT_BASE_URL;
  delete (env as NodeJS.ProcessEnv).MEDKIT_OAUTH_CLIENTS;
  const start = (args: string[] = []) =>
    spawn(
      process.execPath,
      ['--import', 'tsx', 'integrations/server/cli.ts', ...args],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  let server: ReturnType<typeof start> | undefined;
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
    server = undefined;
  }
  async function listen() {
    server = start();
    const started = server;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Server startup timed out')),
        5000,
      );
      started.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      started.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited: ${code}`));
      });
      started.stdout.on('data', (chunk) => {
        if (String(chunk).includes('listening on')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  const request = (route: string, body?: unknown, cookie?: string) =>
    new Promise<Response>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: route,
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Host: 'synthetic.example',
            Origin: 'https://synthetic.example',
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(res.headers))
              for (const item of Array.isArray(value)
                ? value
                : value === undefined
                  ? []
                  : [value])
                headers.append(key, item);
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers,
              }),
            );
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  try {
    const provision = start(['--create-account']);
    let output = '';
    provision.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    expect((await once(provision, 'exit'))[0]).toBe(0);
    const key = output.match(/Access key[^\n]*: (\S+)/)?.[1];
    expect(typeof key).toBe('string');
    await listen();
    const metadata = await request('/.well-known/oauth-protected-resource/mcp');
    expect(metadata.status).toBe(200);
    expect((await metadata.json()).resource).toBe(
      'https://synthetic.example/mcp',
    );
    expect((await request('/api/records')).status).toBe(401);
    expect((await request('/mcp', {})).status).toBe(401);
    const login = await request('/api/login', { key });
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('Secure');
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const mutation = {
      operationId: randomUUID(),
      version: 0,
      commands: [
        { type: 'medicine.save', id: randomUUID(), data: medicineInput },
      ],
    };
    expect((await request('/api/records', mutation, cookie)).status).toBe(200);
    await stop();
    await listen();
    const restored = await request('/api/records', undefined, cookie);
    expect(restored.status).toBe(200);
    expect((await restored.json()).state.medicines).toHaveLength(1);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);
