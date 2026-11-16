import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dist = new URL('../dist/', import.meta.url);
const index = new URL('index.html', dist);
let html = await readFile(index, 'utf8');
html = html.replace(/<html[^>]*>/, '<html lang="ru">')
  .replace(/<title>.*?<\/title>/, '<title>PolyMap — навигация по Политеху</title>');
if (!html.includes('register-offline.js')) {
  html = html.replace('</head>', '<link rel="stylesheet" href="/polymap.css"><script src="/register-offline.js" defer></script></head>');
}
await writeFile(index, html);
for (const route of ['reports', 'share/annotation', 'share/route']) {
  await mkdir(new URL(route + '/', dist), { recursive: true });
  await copyFile(index, new URL(route + '/index.html', dist));
  await copyFile(index, new URL(route + '.html', dist));
}

const jsDir = new URL('_expo/static/js/web/', dist);
const files = (await readdir(jsDir)).filter(name => name.endsWith('.js')).map(name => '/_expo/static/js/web/' + name);
const cssDir = new URL('_expo/static/css/', dist);
const css = (await readdir(cssDir).catch(() => [])).map(name => '/_expo/static/css/' + name);
const manifest = await readFile(new URL('maps/manifest.json', dist), 'utf8');
const hash = createHash('sha256').update(html + files.join() + css.join() + manifest).digest('hex').slice(0, 16);
await writeFile(new URL('register-offline.js', dist),
  "if ('serviceWorker' in navigator) navigator.serviceWorker.register('/offline.js').catch(() => {});\n");
await writeFile(new URL('offline.js', dist), `
const name = 'polymap-shell-${hash}';
const shell = ${JSON.stringify(['/', '/polymap.css', '/maps/manifest.json', '/maps/campus.json', ...files, ...css])};
self.addEventListener('install', event => event.waitUntil(
  caches.open(name).then(cache => cache.addAll(shell)).then(() => self.skipWaiting())
));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('polymap-shell-') && key !== name)
    .map(key => caches.delete(key)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(name).then(cache => cache.match('/'))));
    return;
  }
  if (shell.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.open(name).then(cache => cache.match(url.pathname))));
  }
});
`);
