import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { openDatabase } from '../integrations/server/sqlite';

it('migrates existing Node records and preserves them after reopening', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'medkit-migration-'));
  const file = path.join(dir, 'test.sqlite');
  try {
    const old = new DatabaseSync(file);
    old.exec(
      'CREATE TABLE entries(namespace TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(namespace,key)); PRAGMA user_version=1;',
    );
    old
      .prepare('INSERT INTO entries VALUES(?,?,?)')
      .run('synthetic', 'record', JSON.stringify({ value: 42 }));
    old.close();
    let current = openDatabase(file);
    expect(
      await current.get('synthetic', 'record', z.object({ value: z.number() })),
    ).toEqual({ value: 42 });
    await current.put('synthetic', 'record', { value: 43 });
    current.close();
    current = openDatabase(file);
    expect(
      await current.get('synthetic', 'record', z.object({ value: z.number() })),
    ).toEqual({ value: 43 });
    current.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('rejects an oversized record without partially changing another entry', async () => {
  const db = openDatabase(':memory:');
  try {
    await expect(
      db.atomic(async () => {
        await db.put('synthetic', 'first', { value: 1 });
        await db.put('synthetic', 'large', { text: 'x'.repeat(1_000_001) });
      }),
    ).rejects.toThrow('storage limit');
    expect(await db.list('synthetic', z.unknown())).toEqual([]);
  } finally {
    db.close();
  }
});
