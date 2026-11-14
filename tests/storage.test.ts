import { randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openIndexedDb } from '../src/storage/indexeddb';
import { MedkitService } from '../src/application/service';
import { emptyState } from '../src/domain/model';
import { fixture, now } from './fixtures';

describe('atomic local persistence', () => {
  it('persists records after the store closes and reopens', async () => {
    const factory = new IDBFactory();
    const { state } = fixture();
    const first = await openIndexedDb('restart', factory);
    await first.transact(() => state);
    first.close();
    const second = await openIndexedDb('restart', factory);
    expect(await second.read()).toEqual(state);
    second.close();
  });
  it('serializes concurrent writers without losing a dose or stock update', async () => {
    const factory = new IDBFactory();
    const { state, dose } = fixture();
    const first = await openIndexedDb('concurrent', factory);
    const second = await openIndexedDb('concurrent', factory);
    await first.transact(() => state);
    const a = new MedkitService(
      first,
      () => emptyState(randomUUID()),
      () => now,
    );
    const b = new MedkitService(
      second,
      () => emptyState(randomUUID()),
      () => now,
    );
    await Promise.all([
      a.execute({ operationId: randomUUID(), commands: [dose(2)] }),
      b.execute({ operationId: randomUUID(), commands: [dose(3)] }),
    ]);
    const saved = await a.load();
    expect(saved.doses).toHaveLength(2);
    expect(saved.batches[0]!.quantity).toBe(5);
    a.close();
    b.close();
  });
  it('rolls back an entire compound transaction on validation failure', async () => {
    const factory = new IDBFactory();
    const { state, dose } = fixture();
    const store = await openIndexedDb('rollback', factory);
    await store.transact(() => state);
    const service = new MedkitService(
      store,
      () => state,
      () => now,
    );
    await expect(
      service.execute({
        operationId: randomUUID(),
        commands: [dose(2), dose(20)],
      }),
    ).rejects.toThrow('insufficient');
    expect(await store.read()).toEqual(state);
    service.close();
  });
  it('exports validated data and erases all personal record collections', async () => {
    const factory = new IDBFactory();
    const { state, dose } = fixture();
    const store = await openIndexedDb('export-delete', factory);
    await store.transact(() => state);
    const service = new MedkitService(
      store,
      () => emptyState(randomUUID()),
      () => now,
    );
    await service.execute({ operationId: randomUUID(), commands: [dose()] });
    const exported = JSON.parse(await service.export());
    expect(exported.state.doses).toHaveLength(1);
    await service.erase();
    const erased = await service.load();
    expect(erased.medicines).toEqual([]);
    expect(erased.audit).toEqual([]);
    expect(erased.appliedCommands).toEqual([]);
    expect(erased.profile.id).not.toBe(state.profile.id);
    service.close();
  });
  it('does not overwrite unreadable or future-version data', async () => {
    const factory = new IDBFactory();
    const store = await openIndexedDb('future', factory);
    store.close();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('future', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction('records', 'readwrite');
        tx.objectStore('records').put({ schemaVersion: 99 }, 'state');
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    });
    const reopened = await openIndexedDb('future', factory);
    const service = new MedkitService(reopened, () => emptyState(randomUUID()));
    await expect(service.load()).rejects.toThrow('have not been changed');
    await expect(reopened.read()).rejects.toThrow('have not been changed');
    service.close();
  });
});
