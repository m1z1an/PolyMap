import { createServer, request } from 'node:http';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const upstream = process.env.POLYMAP_UPSTREAM || 'http://127.0.0.1:8000';
const appRoutes = new Set(['/', '/reports', '/share/annotation', '/share/route']);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '') || '/'; }
  catch { res.writeHead(400).end(); return; }
  if (pathname.startsWith('/api/')) {
    const target = new URL(upstream);
    target.pathname = pathname;
    target.search = new URL(req.url, 'http://localhost').search;
    const forward = request(target, { method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    forward.on('error', () => res.writeHead(503, { 'Content-Type': 'application/json' }).end('{"detail":"API unavailable"}'));
    req.pipe(forward);
    return;
  }
  const file = appRoutes.has(pathname) ? resolve(root, 'index.html') : resolve(root, '.' + pathname);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': pathname.startsWith('/_expo/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(Number(process.env.POLYMAP_PORT || 8080), process.env.POLYMAP_HOST || '127.0.0.1', () => {
  console.log(`PolyMap · http://localhost:${process.env.POLYMAP_PORT || 8080}`);
});
