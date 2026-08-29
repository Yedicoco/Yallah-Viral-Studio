import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStudioProject, improveStudioProject, YALLAH_CONTACT } from './lib/generator.mjs';
import { createVideoJob, getVideoJob, getVideoJobFilePath } from './lib/video-jobs.mjs';
import { listAvailableVoices } from './lib/tts.mjs';
import { generateCreativeLayer, detectLlm, getCachedLlmStatus } from './lib/llm.mjs';

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
  ['.ico', 'image/x-icon'],
  ['.mp4', 'video/mp4'],
  ['.ttf', 'font/ttf'],
  ['.wav', 'audio/wav'],
  ['.md', 'text/markdown; charset=utf-8']
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
      sendJson(response, 200, {
        ok: true,
        app: 'Yallah Viral Studio',
        contact: YALLAH_CONTACT,
        videoRender: {
          engine: 'FFmpeg (libx264/AAC) + @napi-rs/canvas — open source',
          resolution: '720x1280 · 30 fps',
          voices: listAvailableVoices()
        },
        textEngine: getCachedLlmStatus().available
          ? { kind: 'llm', provider: getCachedLlmStatus().provider, model: getCachedLlmStatus().model }
          : { kind: 'templates' }
      });
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith('/api/generate')) {
      const input = await readJsonBody(request);
      const creative = await generateCreativeLayer(input);
      const project = generateStudioProject(input, {
        creative: creative?.creative,
        textEngine: creative
          ? { kind: 'llm', provider: creative.provider, model: creative.model, note: 'Hooks et script générés par un LLM local open source, puis validés (coordonnées officielles imposées).' }
          : undefined
      });
      sendJson(response, 200, project);
      return;
    }

    if (request.method === 'POST' && request.url?.startsWith('/api/viralize')) {
      const input = await readJsonBody(request);
      const previous = input.project || input;
      const creative = await generateCreativeLayer(previous.input || previous, {
        viralBoost: true,
        previousHooks: Array.isArray(previous.hooks) ? previous.hooks.slice(0, 5) : []
      });
      sendJson(response, 200, improveStudioProject(previous, {
        creative: creative?.creative,
        textEngine: creative
          ? { kind: 'llm', provider: creative.provider, model: creative.model, note: 'Version virale réécrite par un LLM local open source, puis validée.' }
          : undefined
      }));
      return;
    }

    // ---------- rendu vidéo MP4 (pipeline open source serveur) ----------

    if (request.method === 'POST' && request.url?.startsWith('/api/video-render')) {
      const body = await readJsonBody(request);
      const project = body.project || body;
      if (!project?.script?.scenes?.length) {
        sendJson(response, 400, { error: 'Projet invalide : aucune scène à rendre' });
        return;
      }
      try {
        sendJson(response, 200, createVideoJob(project));
      } catch (error) {
        sendJson(response, error.statusCode || 500, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/video-status/')) {
      const jobId = decodeURIComponent(request.url.slice('/api/video-status/'.length).split('?')[0]);
      const job = getVideoJob(jobId);
      if (!job) {
        sendJson(response, 404, { error: 'Rendu introuvable ou expiré' });
        return;
      }
      sendJson(response, 200, job);
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/video-file/')) {
      const jobId = decodeURIComponent(request.url.slice('/api/video-file/'.length).split('?')[0]);
      const job = getVideoJob(jobId);
      const filePath = getVideoJobFilePath(jobId, 'video');
      if (!job || !filePath) {
        sendJson(response, 404, { error: 'Vidéo introuvable ou rendu pas encore terminé' });
        return;
      }
      try {
        const file = await readFile(filePath);
        response.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': file.length,
          'Content-Disposition': `attachment; filename="${job.filename}"; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
          'Cache-Control': 'no-store'
        });
        response.end(file);
      } catch {
        sendJson(response, 410, { error: 'Fichier de rendu expiré' });
      }
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/video-poster/')) {
      const jobId = decodeURIComponent(request.url.slice('/api/video-poster/'.length).split('?')[0]);
      const filePath = getVideoJobFilePath(jobId, 'poster');
      if (!filePath) {
        sendJson(response, 404, { error: 'Affiche introuvable' });
        return;
      }
      try {
        const file = await readFile(filePath);
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': file.length, 'Cache-Control': 'no-store' });
        response.end(file);
      } catch {
        sendJson(response, 410, { error: 'Affiche expirée' });
      }
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/llm-status')) {
      sendJson(response, 200, await detectLlm({ force: true }));
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/api/voices')) {
      sendJson(response, 200, { voices: listAvailableVoices() });
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
  // Préchauffe la détection du LLM local (Ollama / LM Studio) sans bloquer.
  detectLlm().then(status => {
    console.log(status.available
      ? `[llm] moteur texte : ${status.provider} (${status.model})`
      : '[llm] aucun LLM local détecté — moteur templates (voir docs/llm-local.md pour brancher)');
  });
});
