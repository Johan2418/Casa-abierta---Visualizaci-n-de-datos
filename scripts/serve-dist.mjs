import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('dist');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 5173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

if (!existsSync(root)) {
  console.error('No existe dist/. Ejecuta npm run build antes de servir.');
  process.exit(1);
}

function resolveRequest(url) {
  const pathname = decodeURI(new URL(url, `http://${host}:${port}`).pathname);
  const requested = normalize(pathname === '/' ? '/index.html' : pathname);
  const absolute = resolve(join(root, requested));
  if (!absolute.startsWith(root)) return null;
  if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  return resolve(join(root, 'index.html'));
}

const server = createServer((request, response) => {
  const file = resolveRequest(request.url);
  if (!file) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Sembrando Datos disponible en http://${host}:${port}/`);
});
