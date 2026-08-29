import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStudioProject, improveStudioProject, YALLAH_CONTACT } from './lib/generator.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon']
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = normalize(requestedPath).replace(/^([/\\.])+/, '');
  const absolutePath = join(__dirname, safePath);

  if (!absolutePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(absolutePath);
    const contentType = mimeTypes.get(extname(absolutePath)) || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600'
    });
    response.end(file);
  } catch (error) {
    if (extname(absolutePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const file = await readFile(join(__dirname, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(file);
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url?.startsWith('/api/health')) {
      sendJson(response, 200, { ok: true, app: 'Yallah Viral Studio', contact: YALLAH_CONTACT });
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith('/api/generate')) {
      const input = await readJsonBody(request);
      sendJson(response, 200, generateStudioProject(input));
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith('/api/viralize')) {
      const input = await readJsonBody(request);
      sendJson(response, 200, improveStudioProject(input.project || input));
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, host, () => {
  console.log(`Yallah Viral Studio running on http://${host}:${port}`);
});
