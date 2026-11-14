import { DatabaseSync } from 'node:sqlite';
import { chmodSync } from 'node:fs';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { connectedRecordsSchema } from '../../src/application/connected/contracts';
import { validateState } from '../../src/domain/invariants';
import { emptyState, type State } from '../../src/domain/model';

export const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Database {
  private sql: DatabaseSync;
  private nested = false;
  constructor(file: string) {
    this.sql = new DatabaseSync(file);
    if (file !== ':memory:') chmodSync(file, 0o600);
    this.sql.exec(
      'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON;',
    );
    const version = (
      this.sql.prepare('PRAGMA user_version').get() as { user_version: number }
    ).user_version;
    if (version !== 0 && version !== 1)
      throw new Error('Unsupported server database version.');
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS entries (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(namespace,key)); PRAGMA user_version=1;',
    );
  }
  get<T>(namespace: string, key: string, schema: z.ZodType<T>): T | null {
    const row = this.sql
      .prepare('SELECT value FROM entries WHERE namespace=? AND key=?')
      .get(namespace, key) as { value: string } | undefined;
    return row ? schema.parse(JSON.parse(row.value)) : null;
  }
  list<T>(namespace: string, schema: z.ZodType<T>): T[] {
    return (
      this.sql
        .prepare('SELECT value FROM entries WHERE namespace=?')
        .all(namespace) as { value: string }[]
    ).map((r) => schema.parse(JSON.parse(r.value)));
  }
  put(namespace: string, key: string, value: unknown) {
    this.sql
      .prepare(
        'INSERT INTO entries VALUES (?,?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value',
      )
      .run(namespace, key, JSON.stringify(value));
  }
  delete(namespace: string, key?: string) {
    if (key === undefined)
      this.sql.prepare('DELETE FROM entries WHERE namespace=?').run(namespace);
    else
      this.sql
        .prepare('DELETE FROM entries WHERE namespace=? AND key=?')
        .run(namespace, key);
  }
  removeWhere(namespace: string, predicate: (value: unknown) => boolean) {
    const rows = this.sql
      .prepare('SELECT key,value FROM entries WHERE namespace=?')
      .all(namespace) as { key: string; value: string }[];
    for (const row of rows)
      if (predicate(JSON.parse(row.value))) this.delete(namespace, row.key);
  }
  atomic<T>(fn: () => T): T {
    if (this.nested) return fn();
    this.sql.exec('BEGIN IMMEDIATE');
    this.nested = true;
    try {
      const result = fn();
      this.sql.exec('COMMIT');
      return result;
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    } finally {
      this.nested = false;
    }
  }
  records(subject: string) {
    const value = this.get('records', subject, connectedRecordsSchema);
    if (!value) throw new RequestError(404, 'These records are unavailable.');
    validateState(value.state);
    if (value.state.profile.id !== subject)
      throw new Error('Record ownership mismatch.');
    return value;
  }
  save(subject: string, state: State, version: number) {
    const checked = validateState(state);
    if (checked.profile.id !== subject)
      throw new Error('Record ownership mismatch.');
    this.put('records', subject, { state: checked, version });
  }
  initialize(subject: string) {
    this.save(subject, emptyState(subject), 0);
  }
  audit(subject: string, action: string, actor: string, outcome: string) {
    const key = secret();
    this.put(`audit:${subject}`, key, {
      at: new Date().toISOString(),
      action,
      actor,
      outcome,
    });
    // Metadata only. Health fields and credentials never enter the access audit.
  }
  close() {
    this.sql.close();
  }
}
