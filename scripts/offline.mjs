import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('dist');
const files = (
  await readdir(directory, { recursive: true, withFileTypes: true })
)
  .filter(
    (entry) =>
      entry.isFile() && !entry.name.endsWith('.map') && entry.name !== 'sw.js',
  )
  .map(
    (entry) =>
      '/' +
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
  );
const index = path.join(directory, 'index.html');
const html = (await readFile(index, 'utf8'))
  .replace(/<title>.*?<\/title>/, '<title>MedKit</title>')
  .replace(
    '</head>',
    '<meta name="theme-color" content="#315D4A"><meta name="description" content="Your medicine cabinet, actual doses, and health history. Local first."><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"></head>',
  );
await writeFile(index, html);
const hash = createHash('sha256');
for (const file of files)
  hash.update(await readFile(path.join(directory, file)));
const cache = `medkit-shell-${hash.digest('hex').slice(0, 12)}`;
await writeFile(
  path.join(directory, 'sw.js'),
  `
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('medkit-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (['/api/', '/connect/', '/mcp', '/authorize', '/token', '/revoke', '/.well-known/'].some(prefix => url.pathname.startsWith(prefix))) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
`,
);
console.log(
  `Offline shell: ${files.length} public assets. No health records are cached by the service worker.`,
);
