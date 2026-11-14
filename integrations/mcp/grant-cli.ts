import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createGrant, scopeSchema, writeGrant } from './grants';

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
      scopes: { type: 'string' },
      hours: { type: 'string', default: '24' },
    },
  });
  if (
    !values.input ||
    !values.output ||
    !isAbsolute(values.input) ||
    !isAbsolute(values.output) ||
    !values.scopes
  )
    throw new Error(
      'Use --input and --output with absolute paths outside the repository, and --scopes with comma-separated read scopes.',
    );
  const withinRepository = relative(
    fileURLToPath(new URL('../..', import.meta.url)),
    values.output,
  );
  if (!withinRepository.startsWith('..') && !isAbsolute(withinRepository))
    throw new Error('Save the sensitive grant file outside the repository.');
  const hours = Number(values.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168)
    throw new Error('Choose an expiry between 0 and 168 hours.');
  if ((await stat(values.input)).size > 16 * 1024 * 1024)
    throw new Error('The export exceeds the 16 MB limit.');
  const snapshot: unknown = JSON.parse(await readFile(values.input, 'utf8'));
  const scopes = values.scopes
    .split(',')
    .map((scope) => scopeSchema.parse(scope));
  const { grant, token } = createGrant(
    snapshot,
    scopes,
    new Date(Date.now() + hours * 3_600_000).toISOString(),
  );
  await writeGrant(values.output, grant);
  console.error(
    'Created a sensitive read-only snapshot. Save the token in your MCP client’s private environment settings. The grant file contains the exported records; keep it outside source control.',
  );
  // Explicit one-time credential issuance. Do not add this output to logs or screenshots.
  process.stdout.write(token + '\n');
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && !(error.name === 'ZodError')
      ? error.message
      : 'The export or requested scopes are invalid.',
  );
  process.exitCode = 1;
});
