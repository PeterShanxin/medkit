import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConnectedService } from '../src/storage/connected-client';
import type { RecordStore } from '../src/application/service';
import type { State } from '../src/domain/model';
import { fixture, medicineInput } from './fixtures';
import { Database, RequestError } from '../integrations/server/database';
import { Records } from '../integrations/server/records';

afterEach(() => vi.unstubAllGlobals());
function setup(initial: State | null = null) {
  let cached = initial;
  const cache: RecordStore = {
    read: async () => cached,
    transact: async (update) => (cached = update(cached)),
    clear: async () => {
      cached = null;
    },
    close: () => {},
  };
  const f = fixture();
  const subject = initial?.profile.id ?? f.state.profile.id;
  return { cache, client: new ConnectedService(cache, subject), f, subject };
}
it('reads cached records offline and blocks writes until a current server version is loaded', async () => {
  const f = fixture(),
    s = setup(f.state);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
  expect((await s.client.load()).medicines).toHaveLength(1);
  expect(s.client.syncError).toContain('last downloaded');
  await expect(
    s.client.execute({ operationId: randomUUID(), commands: [f.dose()] }),
  ).rejects.toThrow('Refresh');
});
it('does not replace downloaded records on a version conflict or another account response', async () => {
  const s = setup();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ state: s.f.state, version: 5 })),
    );
  vi.stubGlobal('fetch', fetcher);
  await s.client.load();
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ error: 'Records changed. Refresh.' }), {
      status: 409,
    }),
  );
  await expect(
    s.client.execute({ operationId: randomUUID(), commands: [s.f.dose()] }),
  ).rejects.toThrow('Records changed');
  expect((await s.cache.read())!.batches[0]!.quantity).toBe(10);
  fetcher.mockResolvedValue(
    new Response(JSON.stringify({ state: fixture().state, version: 6 })),
  );
  expect((await s.client.load()).profile.id).toBe(s.subject);
  expect(s.client.syncError).toContain('does not match');
});
it('reports server success even when the offline cache fails', async () => {
  const s = setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ state: s.f.state, version: 1 })),
      ),
  );
  s.cache.transact = async () => {
    throw new Error('Disk full');
  };
  expect((await s.client.load()).medicines).toHaveLength(1);
  expect(s.client.syncError).toContain('Saved online');
});
it('does not repopulate a cache from an in-flight response after sign-out', async () => {
  const s = setup();
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const pending = s.client.load();
  s.client.close();
  resolve(new Response(JSON.stringify({ state: s.f.state, version: 1 })));
  await expect(pending).rejects.toThrow('ended');
  expect(await s.cache.read()).toBeNull();
});

it('retries an uncertain form save with the original payload and deducts stock only once', async () => {
  const s = setup();
  const db = new Database(':memory:');
  db.save(s.subject, s.f.state, 1);
  const records = new Records(db);
  let dropResponse = true;
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'GET') return Response.json(db.records(s.subject));
      const mutation = JSON.parse(init.body as string);
      sent.push(mutation);
      const result = records.execute(s.subject, mutation);
      if (dropResponse) {
        dropResponse = false;
        throw new TypeError('Response lost after commit');
      }
      return Response.json(result);
    }),
  );
  try {
    const snapshot = await s.client.load();
    const edit = s.client.beginEdit(randomUUID(), snapshot);
    const original = s.f.dose();
    await expect(edit.execute([original])).rejects.toThrow(
      'original submission',
    );
    await s.client.load();
    // Forms can regenerate IDs, or the user can edit fields after an uncertain response.
    await edit.execute([s.f.dose(2)]);
    expect(sent[1]).toEqual(sent[0]);
    expect(db.records(s.subject).state.doses).toHaveLength(1);
    expect(db.records(s.subject).state.doses[0]!.id).toBe(original.id);
    expect(db.records(s.subject).state.batches[0]!.quantity).toBe(9);
  } finally {
    db.close();
  }
});
it('keeps the displayed form version after a background refresh and rejects stale edits', async () => {
  const s = setup();
  const db = new Database(':memory:');
  db.save(s.subject, s.f.state, 1);
  const records = new Records(db);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'GET') return Response.json(db.records(s.subject));
      try {
        return Response.json(
          records.execute(s.subject, JSON.parse(init.body as string)),
        );
      } catch (e) {
        if (!(e instanceof RequestError)) throw e;
        return Response.json({ error: e.message }, { status: e.status });
      }
    }),
  );
  try {
    const displayed = await s.client.load();
    records.execute(s.subject, {
      operationId: randomUUID(),
      version: 1,
      commands: [
        {
          type: 'medicine.save',
          id: s.f.medicineId,
          data: {
            ...medicineInput,
            ingredients: [
              { name: 'Corrected ingredient', amount: 20, unit: 'mg', per: 1 },
            ],
          },
        },
      ],
    });
    await s.client.load();
    // Even if a background response arrives before the form mounts, bind to its displayed snapshot.
    const edit = s.client.beginEdit(randomUUID(), displayed);
    await expect(
      edit.execute([
        {
          type: 'medicine.save',
          id: s.f.medicineId,
          data: { ...medicineInput, notes: 'Edited note' },
        },
      ]),
    ).rejects.toThrow('Records changed');
    expect(db.records(s.subject).state.medicines[0]!.ingredients[0]!.name).toBe(
      'Corrected ingredient',
    );
  } finally {
    db.close();
  }
});
it('allows correcting a definitively rejected form submission', async () => {
  const s = setup();
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ state: s.f.state, version: 1 }));
  vi.stubGlobal('fetch', fetcher);
  await s.client.load();
  const edit = s.client.beginEdit(randomUUID());
  fetcher.mockResolvedValue(
    Response.json({ error: 'Invalid amount' }, { status: 400 }),
  );
  await expect(edit.execute([s.f.dose(-1)])).rejects.toThrow('Invalid amount');
  fetcher.mockResolvedValue(Response.json({ state: s.f.state, version: 2 }));
  const corrected = s.f.dose(1);
  await edit.execute([corrected]);
  expect(JSON.parse(fetcher.mock.lastCall![1].body).commands).toEqual([
    corrected,
  ]);
});
