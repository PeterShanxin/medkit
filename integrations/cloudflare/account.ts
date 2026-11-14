import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emptyState } from '../../src/domain/model';
import { hash, secret } from '../server/database';
import { productionConfig, wrangler } from './commands';

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    remote: { type: 'boolean' },
    output: { type: 'string' },
  },
  strict: true,
});
const output = values.output;
if (!output || !path.isAbsolute(output))
  throw new Error(
    'Pass --output with an absolute private file path outside the checkout.',
  );
const relative = path.relative(process.cwd(), output);
if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  throw new Error('Store owner credentials outside the checkout.');
const config = values.remote
  ? productionConfig(values.config ?? '')
  : 'wrangler.jsonc';
const subject = randomUUID(),
  key = secret();
// Never send the owner key to D1 or print it to CLI output. Use exclusive creation.
writeFileSync(output, JSON.stringify({ subject, key }, null, 2) + '\n', {
  mode: 0o600,
  flag: 'wx',
});
const directory = mkdtempSync(path.join(tmpdir(), 'medkit-provision-'));
try {
  const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  const row = (namespace: string, id: string, value: unknown) =>
    [namespace, id, JSON.stringify(value), randomUUID()].map(quote).join(',');
  const sql = `INSERT INTO entries(namespace,key,value,revision) VALUES (${row('owners', hash(key), { subject })}),(${row('records', subject, { state: emptyState(subject), version: 0 })});`;
  const file = path.join(directory, 'account.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  wrangler([
    'd1',
    'execute',
    'DB',
    values.remote ? '--remote' : '--local',
    '--config',
    config,
    '--file',
    file,
  ]);
  console.log(`Account created. Open the private credential file: ${output}`);
} catch {
  throw new Error(
    'Account creation was not confirmed. Keep the private credential file and check D1 before retrying.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
