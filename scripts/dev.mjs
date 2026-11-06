import http from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildSite, output, root } from './build.mjs';

await buildSite();
const clients = new Set();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.woff2': 'font/woff2' };
const reloadScript = '<script>new EventSource("/__dev/events").onmessage=()=>location.reload();</script>';
const server = http.createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }
  if (pathname === '/__dev/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    response.write(': connected\n\n');
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    let file = path.resolve(output, `.${pathname}`);
    if (file !== output && !file.startsWith(`${output}${path.sep}`)) {
      response.writeHead(403).end('Forbidden'); return;
    }
    let status = 200;
    try {
      if ((await stat(file)).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(308, { Location: `${pathname}/` }).end(); return;
        }
        file = path.join(file, 'index.html');
      }
    } catch { status = 404; file = path.join(output, '404.html'); }
    let content = await readFile(file);
    if (file.endsWith('.html')) content = Buffer.from(content.toString().replace('</body>', `${reloadScript}</body>`));
    response.writeHead(status, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end('Unable to serve this page.');
  }
});

const port = Number(process.env.PORT || 4321);
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`\nLocal: http://127.0.0.1:${port}\nWatching content, site.config.json, and public/ for changes.`));

let timer;
let pending = Promise.resolve();
const watcher = watch(root, { recursive: true }, (_event, filename) => {
  if (!filename || !(filename === 'site.config.json' || filename.startsWith(`content${path.sep}`) || filename.startsWith(`public${path.sep}`))) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    pending = pending.then(async () => {
      try {
        await buildSite({ quiet: true });
        for (const client of clients) client.write('data: reload\n\n');
        console.log('Updated.');
      } catch (error) { console.error(`Build failed: ${error.message}`); }
    });
  }, 120);
});

function shutdown() {
  clearTimeout(timer);
  watcher.close();
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
