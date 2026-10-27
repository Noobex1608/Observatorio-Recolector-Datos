import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/kobo-mobile/browser/', import.meta.url));
const port = Number(process.argv[2] || 4201);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

try {
  await stat(resolve(root, 'ngsw.json'));
} catch {
  console.error('Primero ejecuta npm run build para generar el PWA de producción.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
    } catch {
      if (extname(pathname) || pathname.startsWith('/api/') || !request.headers.accept?.includes('text/html')) {
        response.writeHead(404).end();
        return;
      }
      path = resolve(root, 'index.html');
    }
    const contents = await readFile(path);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(400).end();
  }
});

server.on('error', error => {
  console.error(`No se pudo iniciar la vista previa: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`PWA de producción: http://localhost:${port}`);
  console.log('Abre la app con conexión antes de probar el modo sin conexión.');
});
