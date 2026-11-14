import { createHash } from 'node:crypto';
import { z } from 'zod';
import { idSchema } from '../../src/domain/model';
import { Database, hash, RequestError, secret } from './database';
import { Identity } from './identity';
import { Members } from './members';

const accountSchema = z
  .object({
    githubId: z.string().regex(/^[1-9][0-9]*$/),
    subject: idSchema,
    admin: z.boolean().optional(),
  })
  .strict();
export const githubConfigSchema = z
  .object({
    clientId: z.string().min(1).max(200),
    clientSecret: z.string().min(1).max(500),
    accounts: z.array(accountSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.accounts.map((a) => a.githubId)).size ===
      value.accounts.length,
    'Each GitHub account must map to exactly one MedKit account.',
  );
export type GitHubConfig = z.infer<typeof githubConfigSchema>;
export function githubConfig(
  env: Record<string, string | undefined>,
): GitHubConfig | undefined {
  const clientId = env.MEDKIT_GITHUB_CLIENT_ID;
  const clientSecret = env.MEDKIT_GITHUB_CLIENT_SECRET;
  const accounts = env.MEDKIT_GITHUB_ACCOUNTS_JSON;
  if (
    clientId === undefined &&
    clientSecret === undefined &&
    accounts === undefined
  )
    return undefined;
  try {
    return githubConfigSchema.parse({
      clientId,
      clientSecret,
      accounts: JSON.parse(accounts ?? 'null'),
    });
  } catch {
    // Configuration errors must not echo secret values.
    throw new Error(
      'Configure GitHub client ID, client secret, and existing account mappings together.',
    );
  }
}
const pendingSchema = z.object({
  browserHash: z.string(),
  verifier: z.string(),
  returnTo: z.string(),
  expiresAt: z.number(),
});
export const githubReturnTo = z
  .string()
  .max(250)
  .refine(
    (value) =>
      value === '/connections' ||
      /^\/connections\?review=[0-9a-f-]{36}$/.test(value) ||
      /^\/connect\/consent\?request=[A-Za-z0-9_-]{1,100}$/.test(value),
    'Return to the MedKit connections page.',
  );
export class GitHubLogin {
  constructor(
    private db: Database,
    private identity: Identity,
    private base: URL,
    private config: GitHubConfig,
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private now = Date.now,
  ) {}
  async start(returnTo: string) {
    githubReturnTo.parse(returnTo);
    const state = secret(),
      browser = secret(),
      verifier = secret();
    await this.db.put('github-login', hash(state), {
      browserHash: hash(browser),
      verifier,
      returnTo,
      expiresAt: this.now() + 10 * 60_000,
    });
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: new URL('/api/login/github/callback', this.base).href,
      scope: '',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      allow_signup: 'false',
    }).toString();
    return { authorizationUrl: url.href, browser };
  }
  async finish(state: string, browser: string, code?: string) {
    if (!state || !browser)
      throw new RequestError(
        401,
        'Start GitHub sign-in again in this browser.',
      );
    // Consume before network IO. Concurrent callbacks cannot exchange one intent twice.
    const pending = await this.db.atomic(async () => {
      const value = await this.db.get(
        'github-login',
        hash(state),
        pendingSchema,
      );
      if (
        !value ||
        value.expiresAt <= this.now() ||
        value.browserHash !== hash(browser)
      )
        throw new RequestError(
          401,
          'Start GitHub sign-in again in this browser.',
        );
      await this.db.delete('github-login', hash(state));
      return value;
    });
    if (!code) throw new RequestError(401, 'GitHub sign-in was not completed.');
    let githubId: string;
    try {
      const tokenResponse = await this.fetcher(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: new URL('/api/login/github/callback', this.base).href,
            code_verifier: pending.verifier,
          }),
        },
      );
      if (!tokenResponse.ok) throw new Error('Token exchange failed');
      const token = z
        .object({
          access_token: z.string().min(1),
          token_type: z.literal('bearer'),
        })
        .parse(await tokenResponse.json());
      const profileResponse = await this.fetcher(
        'https://api.github.com/user',
        {
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MedKit',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (!profileResponse.ok) throw new Error('Identity verification failed');
      githubId = String(
        z
          .object({
            id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .parse(await profileResponse.json()).id,
      );
    } catch {
      throw new RequestError(
        502,
        'GitHub sign-in could not be verified. Start again.',
      );
    }
    // Provider ID binds the invitation to a person even if their username changes.
    const session = await new Members(this.db, this.config).login(
      githubId,
      this.identity,
    );
    return { session, returnTo: pending.returnTo };
  }
}
