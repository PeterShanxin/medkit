import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConnectedService } from '../src/storage/connected-client';
import type { RecordStore } from '../src/application/service';
import type { State } from '../src/domain/model';
import { fixture } from './fixtures';

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
