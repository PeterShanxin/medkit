import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { configuredClientSchema } from '../server/oauth';
import { githubConfig } from '../server/github-login';

export function wrangler(args: string[]) {
  execFileSync(
    process.execPath,
    [path.resolve('node_modules/wrangler/bin/wrangler.js'), ...args],
    {
      stdio: 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
}
export function productionConfig(file: string) {
  if (path.resolve(file) === path.resolve('wrangler.jsonc'))
    throw new Error('Use a separate production configuration file.');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (raw.vars && 'MEDKIT_GITHUB_CLIENT_SECRET' in raw.vars)
    throw new Error(
      'Store the GitHub client secret with Wrangler secrets, not vars.',
    );
  githubConfig({
    MEDKIT_GITHUB_CLIENT_ID: raw.vars?.MEDKIT_GITHUB_CLIENT_ID,
    MEDKIT_GITHUB_ACCOUNTS_JSON: raw.vars?.MEDKIT_GITHUB_ACCOUNTS_JSON,
    // The real secret is supplied by the deployed Worker binding.
    MEDKIT_GITHUB_CLIENT_SECRET:
      raw.vars?.MEDKIT_GITHUB_CLIENT_ID !== undefined ||
      raw.vars?.MEDKIT_GITHUB_ACCOUNTS_JSON !== undefined
        ? 'validated-at-runtime'
        : undefined,
  });
  const config = z
    .object({
      name: z.string().min(1),
      vars: z.object({
        MEDKIT_BASE_URL: z.string().url(),
        MEDKIT_OAUTH_CLIENTS_JSON: z.string(),
      }),
      d1_databases: z
        .array(
          z.object({
            binding: z.literal('DB'),
            database_id: z.string().uuid(),
          }),
        )
        .length(1),
    })
    .parse(raw);
  const url = new URL(config.vars.MEDKIT_BASE_URL);
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(
      'Set the exact public HTTPS origin in the production configuration.',
    );
  if (
    config.d1_databases[0]!.database_id ===
    '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Create and configure a production D1 database first.');
  z.array(configuredClientSchema).parse(
    JSON.parse(config.vars.MEDKIT_OAUTH_CLIENTS_JSON),
  );
  return file;
}
