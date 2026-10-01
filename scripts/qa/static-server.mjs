import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const port = Math.max(1, Math.min(65535, Number(process.argv[3]) || 4173));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.md', 'text/markdown; charset=utf-8'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const relative = pathname.replace(/^\/+/, '');
  let target = path.resolve(root, relative || 'index.html');
  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    const body = fs.readFileSync(target);
    res.writeHead(200, { 'content-type': types.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Static server listening on http://127.0.0.1:${port}`));

