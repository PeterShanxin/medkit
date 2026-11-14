import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { configuredClientSchema } from './oauth';

export function serverConfig(env: Record<string, string | undefined>) {
  const baseUrl = env.MEDKIT_BASE_URL ?? env.RENDER_EXTERNAL_URL;
  if (!baseUrl)
    throw new Error('Set MEDKIT_BASE_URL to the public HTTPS origin.');
  const file = env.MEDKIT_OAUTH_CLIENTS;
  const json = env.MEDKIT_OAUTH_CLIENTS_JSON;
  if ((file === undefined) === (json === undefined))
    throw new Error(
      'Set exactly one of MEDKIT_OAUTH_CLIENTS or MEDKIT_OAUTH_CLIENTS_JSON.',
    );
  const clients = z
    .array(configuredClientSchema)
    .parse(JSON.parse(file === undefined ? json! : readFileSync(file, 'utf8')));
  return {
    baseUrl,
    clients,
    host: z
      .enum(['127.0.0.1', '0.0.0.0'])
      .parse(env.MEDKIT_BIND_HOST ?? '127.0.0.1'),
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? '4174'),
  };
}
