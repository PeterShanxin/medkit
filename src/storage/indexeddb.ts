import { validateState } from '../domain/invariants';
import { type State } from '../domain/model';
import { type RecordStore } from '../application/service';

export function openIndexedDb(
  name: string,
  factory: IDBFactory = indexedDB,
): Promise<RecordStore> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () =>
      reject(
        new Error(
          'Local storage could not open. Check your browser storage settings.',
        ),
      );
    request.onblocked = () =>
      reject(new Error('Close other MedKit tabs, then try again.'));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve({
        read: () =>
          new Promise((done, fail) => {
            const transaction = database.transaction('records', 'readonly');
            const read = transaction.objectStore('records').get('state');
            read.onsuccess = () => {
              try {
                done(read.result ? validateState(read.result) : null);
              } catch {
                fail(
                  new Error(
                    'The saved records could not be read. They have not been changed.',
                  ),
                );
              }
            };
            read.onerror = () =>
              fail(new Error('The saved records could not be read.'));
          }),
        transact: (update) =>
          new Promise((done, fail) => {
            const transaction = database.transaction('records', 'readwrite');
            const records = transaction.objectStore('records');
            let result: State;
            let error: unknown;
            const read = records.get('state');
            read.onsuccess = () => {
              try {
                const current = read.result ? validateState(read.result) : null;
                result = validateState(update(current));
                records.put(result, 'state');
              } catch (cause) {
                error = cause;
                transaction.abort();
              }
            };
            transaction.oncomplete = () => done(result);
            transaction.onabort = () =>
              fail(
                error ??
                  new Error(
                    'The change was not saved. Check available device storage and try again.',
                  ),
              );
            transaction.onerror = () => {
              error ??= new Error(
                'The change was not saved. Check available device storage and try again.',
              );
            };
          }),
        clear: () =>
          new Promise((done, fail) => {
            const transaction = database.transaction('records', 'readwrite');
            transaction.objectStore('records').clear();
            transaction.oncomplete = () => done();
            transaction.onabort = () =>
              fail(new Error('The records could not be deleted. Try again.'));
          }),
        close: () => database.close(),
      });
    };
  });
}
