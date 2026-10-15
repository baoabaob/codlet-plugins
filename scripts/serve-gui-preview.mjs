// Loopback-only preview; exposes just the checked-in UI fixture and its assets.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.CODLET_CORE_SDK_ROOT ?? path.join(root, '.core-sdk');
if (!path.isAbsolute(sdk)) throw Error('CODLET_CORE_SDK_ROOT must be an absolute prepared snapshot');
const allowed = new Set([
  '/scripts/preview-codlet-gui.html', '/bundled/runtime/ui.js', '/bundled/runtime/i18n.js', '/bundled/runtime/page.js',
  '/scripts/preview-runtime.mjs', '/scripts/preview-fixtures.mjs', '/scripts/preview-context.mjs', '/frontend/src/icons.js',
  '/bundled/codlet/dist/renderer.js', '/bundled/codlet/codlet.json',
]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (!['GET', 'HEAD'].includes(request.method) || !allowed.has(pathname)) { response.writeHead(404); response.end(); return; }
  const file = pathname.startsWith('/bundled/runtime/') ? path.join(sdk, pathname) : path.join(root, pathname);
  response.writeHead(200, { 'Content-Type': pathname.endsWith('.html') ? 'text/html; charset=utf-8' : pathname.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + '/scripts/preview-codlet-gui.html'));
