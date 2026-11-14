import { openDatabaseAsync } from 'expo-sqlite';
import { type RecordStore } from '../application/service';
import { validateState } from '../domain/invariants';
import { type State } from '../domain/model';

export async function openStore(name: string): Promise<RecordStore> {
  const database = await openDatabaseAsync(`${name}.sqlite`);
  await database.execAsync(
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);',
  );
  return {
    async read() {
      const row = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM records WHERE id=1',
      );
      return row ? validateState(JSON.parse(row.value)) : null;
    },
    async transact(update) {
      let result: State | undefined;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const row = await transaction.getFirstAsync<{ value: string }>(
          'SELECT value FROM records WHERE id=1',
        );
        result = validateState(
          update(row ? validateState(JSON.parse(row.value)) : null),
        );
        await transaction.runAsync(
          'INSERT INTO records(id, value) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
          JSON.stringify(result),
        );
      });
      if (!result) throw new Error('The change was not saved. Try again.');
      return result;
    },
    async clear() {
      await database.runAsync('DELETE FROM records');
    },
    close() {
      void database.closeAsync();
    },
  };
}
