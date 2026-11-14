import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Database } from './database';
import { Identity } from './identity';
import { createServerApp } from './app';
import { serverConfig } from './config';

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
  const { baseUrl, clients, host, port } = serverConfig(process.env);
  const { app } = createServerApp({
    db,
    baseUrl,
    clients,
    webRoot: path.resolve('dist'),
  });
  const server = app.listen(port, host, () =>
    console.log(
      `MedKit connected server is listening on ${host}:${port}. Remote access requires a trusted HTTPS reverse proxy.`,
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
