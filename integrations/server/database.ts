import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
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
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}
export interface SqlDriver {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
  close?(): void;
}
type Row = { namespace: string; key: string; value: string; revision: string };
type Read = { namespace: string; key: string; revision: string | null };
type Transaction = {
  reads: Map<string, Read>;
  cache: Map<string, Row | null>;
  ranges: Map<string, string | null>;
  writes: Map<string, Row | Read>;
};
const rowKey = (namespace: string, key: string) =>
  JSON.stringify([namespace, key]);

// AsyncLocalStorage isolates concurrent requests. No SQL transaction spans an await.
// Each commit checks every observed row and range inside the same atomic SQL batch.
export class Database {
  private context = new AsyncLocalStorage<Transaction>();
  constructor(private sql: SqlDriver) {}
  private async row(namespace: string, key: string): Promise<Row | null> {
    const tx = this.context.getStore(),
      id = rowKey(namespace, key);
    const staged = tx?.writes.get(id);
    if (staged) return 'value' in staged ? staged : null;
    if (tx?.cache.has(id)) return tx.cache.get(id)!;
    const value = await this.sql
      .prepare('SELECT * FROM entries WHERE namespace=? AND key=?')
      .bind(namespace, key)
      .first<Row>();
    tx?.reads.set(id, { namespace, key, revision: value?.revision ?? null });
    tx?.cache.set(id, value);
    return value;
  }
  async get<T>(
    namespace: string,
    key: string,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    const row = await this.row(namespace, key);
    return row ? schema.parse(JSON.parse(row.value)) : null;
  }
  private async rows(namespace: string): Promise<Row[]> {
    const tx = this.context.getStore();
    // Capture the range revision before reading rows. The commit guard detects phantoms.
    if (tx && !tx.ranges.has(namespace)) {
      const version = await this.sql
        .prepare('SELECT revision FROM namespaces WHERE namespace=?')
        .bind(namespace)
        .first<{ revision: string }>();
      tx.ranges.set(namespace, version?.revision ?? null);
    }
    const { results } = await this.sql
      .prepare('SELECT * FROM entries WHERE namespace=?')
      .bind(namespace)
      .all<Row>();
    const rows = new Map(results.map((row) => [row.key, row]));
    for (const row of tx?.writes.values() ?? [])
      if (row.namespace === namespace) {
        if ('value' in row) rows.set(row.key, row);
        else rows.delete(row.key);
      }
    return [...rows.values()];
  }
  async list<T>(namespace: string, schema: z.ZodType<T>): Promise<T[]> {
    return (await this.rows(namespace)).map((row) =>
      schema.parse(JSON.parse(row.value)),
    );
  }
  async put(namespace: string, key: string, value: unknown): Promise<void> {
    const encoded = JSON.stringify(value);
    // Leave headroom under D1's row limit; reject before changing any record.
    if (new TextEncoder().encode(encoded).length > 1_000_000)
      throw new RequestError(
        413,
        'These connected records exceed the current storage limit. Export your records before adding more.',
      );
    await this.atomic(async () => {
      await this.row(namespace, key);
      this.context.getStore()!.writes.set(rowKey(namespace, key), {
        namespace,
        key,
        value: encoded,
        revision: randomUUID(),
      });
    });
  }
  async delete(namespace: string, key?: string): Promise<void> {
    await this.atomic(async () => {
      const keys =
        key === undefined
          ? (await this.rows(namespace)).map((r) => r.key)
          : [key];
      for (const k of keys) {
        if (!this.context.getStore()!.ranges.has(namespace))
          await this.row(namespace, k);
        this.context.getStore()!.writes.set(rowKey(namespace, k), {
          namespace,
          key: k,
          revision: null,
        });
      }
    });
  }
  async removeWhere(namespace: string, predicate: (value: unknown) => boolean) {
    await this.atomic(async () => {
      for (const row of await this.rows(namespace))
        if (predicate(JSON.parse(row.value)))
          await this.delete(namespace, row.key);
    });
  }
  async atomic<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    for (let attempt = 0; attempt < 4; attempt++) {
      const tx: Transaction = {
        reads: new Map(),
        cache: new Map(),
        ranges: new Map(),
        writes: new Map(),
      };
      try {
        return await this.context.run(tx, async () => {
          const result = await fn();
          await this.commit(tx);
          return result;
        });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('medkit_transaction_valid')
        )
          throw error;
      }
    }
    throw new RequestError(
      409,
      'Records changed during this request. Refresh and try again.',
    );
  }
  private async commit(tx: Transaction) {
    if (!tx.reads.size && !tx.ranges.size && !tx.writes.size) return;
    const id = randomUUID();
    const statements = [
      this.sql
        .prepare(
          `
      INSERT INTO transaction_guard(id,valid) SELECT ?,
        NOT EXISTS (
          SELECT 1 FROM json_each(?) r LEFT JOIN entries e
          ON e.namespace=json_extract(r.value,'$.namespace') AND e.key=json_extract(r.value,'$.key')
          WHERE e.revision IS NOT json_extract(r.value,'$.revision')
        ) AND NOT EXISTS (
          SELECT 1 FROM json_each(?) r LEFT JOIN namespaces n
          ON n.namespace=json_extract(r.value,'$.namespace')
          WHERE n.revision IS NOT json_extract(r.value,'$.revision')
        )`,
        )
        .bind(
          id,
          JSON.stringify([...tx.reads.values()]),
          JSON.stringify(
            [...tx.ranges].map(([namespace, revision]) => ({
              namespace,
              revision,
            })),
          ),
        ),
    ];
    const writes = [...tx.writes.values()];
    const upserts = writes.filter((row) => 'value' in row);
    const deletions = writes.filter((row) => !('value' in row));
    if (upserts.length)
      statements.push(
        this.sql
          .prepare(
            `
      INSERT INTO entries(namespace,key,value,revision)
      SELECT json_extract(value,'$.namespace'),json_extract(value,'$.key'),json_extract(value,'$.value'),json_extract(value,'$.revision')
      FROM json_each(?) WHERE true
      ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,revision=excluded.revision
    `,
          )
          .bind(JSON.stringify(upserts)),
      );
    if (deletions.length)
      statements.push(
        this.sql
          .prepare(
            `
      DELETE FROM entries WHERE (namespace,key) IN (
        SELECT json_extract(value,'$.namespace'),json_extract(value,'$.key') FROM json_each(?)
      )
    `,
          )
          .bind(JSON.stringify(deletions)),
      );
    statements.push(
      this.sql.prepare('DELETE FROM transaction_guard WHERE id=?').bind(id),
    );
    await this.sql.batch(statements);
  }
  async records(subject: string) {
    const value = await this.get('records', subject, connectedRecordsSchema);
    if (!value) throw new RequestError(404, 'These records are unavailable.');
    validateState(value.state);
    if (value.state.profile.id !== subject)
      throw new Error('Record ownership mismatch.');
    return value;
  }
  async save(subject: string, state: State, version: number) {
    const checked = validateState(state);
    if (checked.profile.id !== subject)
      throw new Error('Record ownership mismatch.');
    await this.put('records', subject, { state: checked, version });
  }
  async initialize(subject: string) {
    await this.save(subject, emptyState(subject), 0);
  }
  async audit(subject: string, action: string, actor: string, outcome: string) {
    const key = secret();
    await this.put(`audit:${subject}`, key, {
      at: new Date().toISOString(),
      action,
      actor,
      outcome,
    });
    // Metadata only. Health fields and credentials never enter the access audit.
  }
  close() {
    this.sql.close?.();
  }
}
