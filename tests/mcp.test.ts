import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  authorize,
  createGrant,
  grantReader,
  writeGrant,
} from '../integrations/mcp/grants';
import { createMcpServer } from '../integrations/mcp/server';
import { fixture, now } from './fixtures';

function grantFixture() {
  return createGrant(
    { format: 'medkit', exportedAt: now, state: fixture().state },
    ['cabinet:read'],
    '2099-01-01T00:00:00.000Z',
  );
}

describe('MCP authorization', () => {
  it('rejects missing, wrong, expired, revoked, and insufficient credentials', () => {
    const { grant, token } = grantFixture();
    expect(() => authorize(grant, '', ['cabinet:read'])).toThrow(
      'Access denied',
    );
    expect(() => authorize(grant, 'wrong', ['cabinet:read'])).toThrow(
      'Access denied',
    );
    expect(() => authorize(grant, token, ['history:read'])).toThrow(
      'Access denied',
    );
    expect(() =>
      authorize({ ...grant, expiresAt: now }, token, ['cabinet:read']),
    ).toThrow('Access denied');
    expect(() =>
      authorize({ ...grant, revokedAt: now }, token, ['cabinet:read']),
    ).toThrow('Access denied');
  });
  it('isolates tokens and subjects across independent users', () => {
    const a = grantFixture();
    const b = grantFixture();
    expect(() => authorize(a.grant, b.token, ['cabinet:read'])).toThrow(
      'Access denied',
    );
    expect(() =>
      authorize({ ...a.grant, subject: randomUUID() }, a.token, [
        'cabinet:read',
      ]),
    ).toThrow('Access denied');
    expect(authorize(a.grant, a.token, ['cabinet:read']).profile.id).toBe(
      a.grant.subject,
    );
  });
  it('exposes only nine read-only tools and rejects cross-user parameters and writes', async () => {
    const { grant, token } = grantFixture();
    const server = createMcpServer(async (scopes) => ({
      state: authorize(grant, token, scopes),
      snapshotAt: now,
    }));
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      const list = await client.listTools();
      expect(list.tools).toHaveLength(9);
      expect(list.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(
        true,
      );
      const result = await client.callTool({
        name: 'list_medicines',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ readOnly: true });
      expect(result.structuredContent).toMatchObject({
        data: [{ inventory: { total: 10 }, batches: [{ quantity: 10 }] }],
      });
      expect(
        (await client.callTool({ name: 'get_recent_doses', arguments: {} }))
          .isError,
      ).toBe(true);
      expect(
        (
          await client.callTool({
            name: 'list_medicines',
            arguments: { userId: randomUUID() },
          })
        ).isError,
      ).toBe(true);
      expect(
        (await client.callTool({ name: 'record_dose', arguments: {} })).isError,
      ).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it('re-reads revocation and writes payload-free audit records', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'medkit-test-'));
    const file = path.join(folder, 'grant.json');
    const { grant, token } = grantFixture();
    try {
      await writeGrant(file, grant);
      const reader = grantReader(file, token);
      await reader(['cabinet:read'], 'list_medicines');
      const audit = await readFile(`${file}.audit.jsonl`, 'utf8');
      expect(audit).not.toContain('Paracetamol');
      expect(audit).not.toContain(token);
      await writeFile(
        file,
        JSON.stringify({ ...grant, revokedAt: new Date().toISOString() }),
      );
      await expect(reader(['cabinet:read'], 'list_medicines')).rejects.toThrow(
        'Access denied',
      );
      expect(await readFile(`${file}.audit.jsonl`, 'utf8')).toContain(
        '"outcome":"denied"',
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('connects an actual SDK client to the stdio server process', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'medkit-stdio-'));
    const file = path.join(folder, 'grant.json');
    const { grant, token } = grantFixture();
    await writeGrant(file, grant);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'integrations/mcp/stdio.ts'],
      cwd: process.cwd(),
      env: { MEDKIT_GRANT_FILE: file, MEDKIT_GRANT_TOKEN: token },
      stderr: 'pipe',
    });
    const client = new Client({
      name: 'medkit-integration-test',
      version: '1',
    });
    try {
      await client.connect(transport);
      const response = await client.callTool({
        name: 'search_medicines',
        arguments: { query: '示例' },
      });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ snapshotAt: now });
      await writeFile(
        file,
        JSON.stringify({ ...grant, revokedAt: new Date().toISOString() }),
      );
      expect(
        (await client.callTool({ name: 'list_medicines', arguments: {} }))
          .isError,
      ).toBe(true);
    } finally {
      await client.close();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
