import { DatabaseSync } from 'node:sqlite';
import { chmodSync, readFileSync } from 'node:fs';
import { Database, type Statement } from './database';

// Node development and D1 use the same transaction implementation and schema.
export function openDatabase(file: string) {
  const sql = new DatabaseSync(file);
  if (file !== ':memory:') chmodSync(file, 0o600);
  sql.exec(
    'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;',
  );
  const version = (
    sql.prepare('PRAGMA user_version').get() as { user_version: number }
  ).user_version;
  if (![0, 1, 2].includes(version)) {
    sql.close();
    throw new Error('Unsupported server database version.');
  }
  if (version < 2) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      if (version === 1)
        sql.exec('ALTER TABLE entries RENAME TO legacy_entries');
      sql.exec(
        readFileSync(
          'integrations/cloudflare/migrations/0001_entries.sql',
          'utf8',
        ),
      );
      if (version === 1)
        sql.exec(
          'INSERT INTO entries SELECT namespace,key,value,lower(hex(randomblob(16))) FROM legacy_entries; DROP TABLE legacy_entries;',
        );
      sql.exec('PRAGMA user_version=2; COMMIT');
    } catch (error) {
      sql.exec('ROLLBACK');
      sql.close();
      throw error;
    }
  }
  class Query implements Statement {
    constructor(
      readonly text: string,
      readonly values: (string | number | null)[] = [],
    ) {}
    bind(...values: (string | number | null)[]) {
      return new Query(this.text, values);
    }
    async first<T>() {
      return (
        (sql.prepare(this.text).get(...this.values) as T | undefined) ?? null
      );
    }
    async all<T>() {
      return { results: sql.prepare(this.text).all(...this.values) as T[] };
    }
  }
  return new Database({
    prepare: (text) => new Query(text),
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        for (const statement of statements) {
          if (!(statement instanceof Query))
            throw new Error('Invalid SQL statement.');
          sql.prepare(statement.text).run(...statement.values);
        }
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sql.close(),
  });
}
