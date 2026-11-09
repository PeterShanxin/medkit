import { writeFile, rename, rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { readGrant } from './grants';

async function main() {
  const { values } = parseArgs({ options: { grant: { type: 'string' } } });
  if (!values.grant || !isAbsolute(values.grant))
    throw new Error('Use --grant with the absolute grant file path.');
  const grant = await readGrant(values.grant);
  grant.revokedAt = new Date().toISOString();
  const temporary = `${values.grant}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(grant), {
    flag: 'wx',
    mode: 0o600,
  });
  try {
    await rename(temporary, values.grant);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(
    'Grant revoked. Later tool calls are denied. Previously shared responses cannot be recalled.',
  );
}
void main().catch(() => {
  console.error(
    'The grant could not be revoked. Check the path and file permissions, or remove the grant file.',
  );
  process.exitCode = 1;
});
