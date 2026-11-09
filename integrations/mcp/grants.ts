import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  exportSchema,
  idSchema,
  timestampSchema,
  type State,
} from '../../src/domain/model';
import { validateState } from '../../src/domain/invariants';

export const scopeSchema = z.enum([
  'cabinet:read',
  'medication:read',
  'history:read',
  'safety:read',
]);
export type Scope = z.infer<typeof scopeSchema>;
export const grantSchema = z
  .object({
    version: z.literal(1),
    id: idSchema,
    subject: idSchema,
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopes: z.array(scopeSchema).min(1),
    expiresAt: timestampSchema,
    revokedAt: timestampSchema.nullable(),
    snapshot: exportSchema,
  })
  .strict();
export type Grant = z.infer<typeof grantSchema>;
export class AccessDenied extends Error {
  constructor() {
    super('Access denied or shared records unavailable.');
  }
}

export function createGrant(
  snapshot: unknown,
  scopes: Scope[],
  expiresAt: string,
): { grant: Grant; token: string } {
  const checked = exportSchema.parse(snapshot);
  validateState(checked.state);
  if (Date.parse(expiresAt) <= Date.now())
    throw new Error('Choose a future expiry time.');
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    grant: grantSchema.parse({
      version: 1,
      id: randomUUID(),
      subject: checked.state.profile.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      scopes: [...new Set(scopes)],
      expiresAt,
      revokedAt: null,
      snapshot: checked,
    }),
  };
}

export function authorize(
  grant: Grant,
  token: string,
  required: Scope[],
  now = new Date().toISOString(),
): State {
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(grant.tokenHash, 'hex');
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual) ||
    grant.revokedAt ||
    Date.parse(grant.expiresAt) <= Date.parse(now) ||
    required.some((scope) => !grant.scopes.includes(scope)) ||
    grant.subject !== grant.snapshot.state.profile.id
  )
    throw new AccessDenied();
  return validateState(grant.snapshot.state);
}

export async function readGrant(file: string): Promise<Grant> {
  const metadata = await stat(file);
  if (metadata.size > 16 * 1024 * 1024) throw new AccessDenied();
  return grantSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export function grantReader(file: string, token: string) {
  return async (scopes: Scope[], tool: string) => {
    try {
      // Re-read on every call so local revocation and deletion take effect immediately.
      const grant = await readGrant(file);
      const state = authorize(grant, token, scopes);
      await appendFile(
        `${file}.audit.jsonl`,
        JSON.stringify({
          at: new Date().toISOString(),
          grantId: grant.id,
          tool,
          outcome: 'allowed',
        }) + '\n',
        { mode: 0o600 },
      );
      return { state, snapshotAt: grant.snapshot.exportedAt };
    } catch {
      await appendFile(
        `${file}.audit.jsonl`,
        JSON.stringify({
          at: new Date().toISOString(),
          tool,
          outcome: 'denied',
        }) + '\n',
        { mode: 0o600 },
      ).catch(() => {});
      throw new AccessDenied();
    }
  };
}

export async function writeGrant(file: string, grant: Grant): Promise<void> {
  await writeFile(file, JSON.stringify(grantSchema.parse(grant)), {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}
