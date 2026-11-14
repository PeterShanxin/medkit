import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import { Database, type Statement } from '../server/database';

export function openD1(db: D1Database) {
  class Query implements Statement {
    constructor(readonly statement: D1PreparedStatement) {}
    bind(...values: (string | number | null)[]) {
      return new Query(this.statement.bind(...values));
    }
    first<T>() {
      return this.statement.first<T>();
    }
    all<T>() {
      return this.statement.all<T>();
    }
  }
  return new Database({
    prepare: (sql) => new Query(db.prepare(sql)),
    batch: (statements) =>
      db.batch(
        statements.map((query) => {
          if (!(query instanceof Query))
            throw new Error('Invalid D1 statement.');
          return query.statement;
        }),
      ),
  });
}
