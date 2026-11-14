import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Database } from './database';
import { Identity } from './identity';
import { configuredClientSchema } from './oauth';
import { createServerApp } from './app';

const file = process.env.MEDKIT_DATABASE;
if (!file || !path.isAbsolute(file))
  throw new Error(
    'Set MEDKIT_DATABASE to an absolute private path outside the repository.',
  );
const relative = path.relative(process.cwd(), file);
if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  throw new Error('Store the database outside the repository.');
mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
const db = new Database(file);
if (process.argv.includes('--create-account')) {
  const account = new Identity(db).provision();
  console.log(
    `Account: ${account.subject}\nAccess key (store privately; do not share with AI clients): ${account.key}`,
  );
  db.close();
} else {
  const baseUrl = process.env.MEDKIT_BASE_URL;
  const clientsFile = process.env.MEDKIT_OAUTH_CLIENTS;
  if (!baseUrl || !clientsFile)
    throw new Error('Set MEDKIT_BASE_URL and MEDKIT_OAUTH_CLIENTS.');
  const clients = z
    .array(configuredClientSchema)
    .min(1)
    .parse(JSON.parse(readFileSync(clientsFile, 'utf8')));
  const { app } = createServerApp({
    db,
    baseUrl,
    clients,
    webRoot: path.resolve('dist'),
  });
  const server = app.listen(Number(process.env.PORT ?? 4174), '127.0.0.1', () =>
    console.log(
      'MedKit connected server is listening on loopback. Use a trusted HTTPS reverse proxy for remote access.',
    ),
  );
  const stop = () =>
    server.close(() => {
      db.close();
      process.exit(0);
    });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
