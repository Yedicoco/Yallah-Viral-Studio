import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateStudioProject, improveStudioProject, YALLAH_CONTACT } from './lib/generator.mjs';
import { createVideoJob, getVideoJob, getVideoJobFilePath } from './lib/video-jobs.mjs';
import { getVoiceDiagnostics, listAvailableVoices } from './lib/tts.mjs';
import { generateCreativeLayer, detectLlm, getCachedLlmStatus } from './lib/llm.mjs';
import { renderPoster, posterFilename } from './lib/posters.mjs';
import { createDataStore } from './lib/store.mjs';
import { createAuthService } from './lib/auth.mjs';
import { interpretAutoRequest } from './lib/auto-brief.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 1_000_000;
const MAX_PROJECT_BYTES = 900_000;

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

function securityHeaders(contentType = '') {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(contentType.startsWith('text/html') ? {
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:"
    } : {})
  };
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  if (response.headersSent) return;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders('application/json'),
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode = Number(error.statusCode) || 500;
  if (statusCode >= 500) console.error(error);
  sendJson(response, statusCode, {
    error: statusCode >= 500 ? (error.publicMessage || 'Erreur interne du serveur') : error.message,
    code: error.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR')
  }, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
}

function httpError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function decodePathValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw httpError('Identifiant URL invalide.', 400, 'INVALID_PATH_VALUE');
  }
}

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    request.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(httpError('Payload trop volumineux.', 413, 'PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) return resolveBody({});
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(httpError('Corps JSON invalide.', 400, 'INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  const expectedHost = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  try {
    if (!expectedHost || new URL(origin).host !== expectedHost) {
      throw httpError('Origine de requête refusée.', 403, 'INVALID_ORIGIN');
    }
  } catch (error) {
    if (error.statusCode) throw error;
    throw httpError('Origine de requête invalide.', 403, 'INVALID_ORIGIN');
  }
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 128);
}

function createRateLimiter({ windowMs, max }) {
  const buckets = new Map();
  return (request, scope) => {
    const now = Date.now();
    if (buckets.size >= 2_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
      // Borne mémoire même si des en-têtes IP falsifiés créent beaucoup de clés.
      while (buckets.size >= 5_000) buckets.delete(buckets.keys().next().value);
    }
    const key = `${scope}:${clientIp(request)}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    current.count += 1;
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      throw Object.assign(httpError('Trop de tentatives. Réessayez plus tard.', 429, 'RATE_LIMITED'), { retryAfter });
    }
  };
}

function validateAutoCreationInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError('Demande de création invalide.', 400, 'INVALID_AUTO_REQUEST');
  }
  if (typeof body.prompt !== 'string') {
    throw httpError('Décrivez votre idée publicitaire.', 400, 'AUTO_PROMPT_REQUIRED');
  }
  const prompt = body.prompt
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (prompt.length < 8) {
    throw httpError('Décrivez votre idée avec au moins quelques mots.', 400, 'AUTO_PROMPT_TOO_SHORT');
  }
  if (prompt.length > 1_500) {
    throw httpError('La demande est trop longue (1 500 caractères maximum).', 413, 'AUTO_PROMPT_TOO_LONG');
  }
  const output = String(body.output || 'auto').toLowerCase();
  if (!['auto', 'poster', 'video', 'both'].includes(output)) {
    throw httpError('Choisissez Affiche, Vidéo ou Les deux.', 400, 'INVALID_AUTO_OUTPUT');
  }
  return { prompt, output };
}

function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw httpError('Projet invalide.', 400, 'INVALID_PROJECT');
  }
  if (!/^[a-zA-Z0-9_-]{6,160}$/.test(String(project.id || ''))) {
    throw httpError('Identifiant de projet invalide.', 400, 'INVALID_PROJECT_ID');
  }
  if (String(project.title || '').length > 500
      || String(project.script?.voiceOver || '').length > 5_000
      || (Array.isArray(project.hooks) && (project.hooks.length > 20 || project.hooks.some(hook => String(hook).length > 500)))) {
    throw httpError('Projet invalide : texte global trop long.', 413, 'PROJECT_TEXT_TOO_LARGE');
  }
  if (!project.script?.scenes?.length || project.script.scenes.length > 20) {
    throw httpError('Projet invalide : scènes absentes ou trop nombreuses.', 400, 'INVALID_PROJECT');
  }
  if (Array.isArray(project.subtitles)
      && (project.subtitles.length > 100 || project.subtitles.some(item => String(item?.text || '').length > 1_000))) {
    throw httpError('Projet invalide : sous-titres trop volumineux.', 413, 'SUBTITLES_TOO_LARGE');
  }
  let totalDuration = 0;
  let totalVoiceCharacters = 0;
  for (const scene of project.script.scenes) {
    const duration = Number(scene?.duration);
    const voiceLength = String(scene?.voice || '').length;
    if (!scene || typeof scene !== 'object' || !Number.isFinite(duration) || duration < 0.5 || duration > 90) {
      throw httpError('Projet invalide : durée de scène incorrecte.', 400, 'INVALID_SCENE');
    }
    if (voiceLength > 1_000 || String(scene.onScreenText || '').length > 1_000) {
      throw httpError('Projet invalide : texte de scène trop long.', 413, 'SCENE_TOO_LARGE');
    }
    totalDuration += duration;
    totalVoiceCharacters += voiceLength;
  }
  if (totalDuration > 120 || totalVoiceCharacters > 12_000) {
    throw httpError('Projet invalide : scénario trop long pour un rendu court.', 413, 'SCENARIO_TOO_LARGE');
  }
  if (Buffer.byteLength(JSON.stringify(project)) > MAX_PROJECT_BYTES) {
    throw httpError('Projet trop volumineux.', 413, 'PROJECT_TOO_LARGE');
  }
  return project;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  let requestedPath;
  try {
    requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  } catch {
    throw httpError('Chemin invalide.', 400, 'INVALID_PATH');
  }
  const safePath = normalize(requestedPath).replace(/^([/\\.])+/, '');
  const absolutePath = join(__dirname, safePath);
  const pathFromRoot = relative(__dirname, absolutePath);

  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot.includes(`..${sep}`)) {
    throw httpError('Accès refusé.', 403, 'FORBIDDEN');
  }

  // Le serveur vit à la racine du dépôt : ne jamais exposer le code backend,
  // les bases SQLite, les fichiers .env, les tests ou les manifests npm.
  const isPublicAsset = safePath === 'index.html'
    || safePath === join('lib', 'frame-draw.mjs')
    || safePath.startsWith(`src${sep}`)
    || safePath.startsWith(`assets${sep}`);
  if (!isPublicAsset) {
    response.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...securityHeaders('text/plain')
    });
    response.end('Not found');
    return;
  }

  try {
    const file = await readFile(absolutePath);
    const contentType = mimeTypes.get(extname(absolutePath)) || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=3600',
      ...securityHeaders(contentType)
    });
    if (request.method === 'HEAD') response.end();
    else response.end(file);
  } catch (error) {
    if (error.statusCode) throw error;
    if (extname(absolutePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders('text/plain') });
      response.end('Not found');
      return;
    }
    const file = await readFile(join(__dirname, 'index.html'));
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...securityHeaders('text/html')
    });
    if (request.method === 'HEAD') response.end();
    else response.end(file);
  }
}

/**
 * Builds an importable HTTP server. Tests bind it to an ephemeral port; the
 * executable entry point below binds to HOST/PORT.
 */
export async function createStudioServer(options = {}) {
  const store = options.store || await createDataStore({
    url: options.databaseUrl,
    authToken: options.databaseAuthToken
  });
  const ownsStore = !options.store;
  const authRequired = options.authRequired ?? process.env.YVS_AUTH_REQUIRED !== 'false';
  const auth = createAuthService(store, {
    registrationEnabled: options.registrationEnabled,
    sessionSecret: options.sessionSecret,
    secureCookie: options.secureCookie
  });
  await store.deleteExpiredSessions?.();
  const limitAuth = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 12 });
  const limitAutomaticCreation = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 15 });

  async function authContext(request, { csrf = false } = {}) {
    const session = await auth.authenticate(request);
    if (!session && authRequired) throw httpError('Connectez-vous pour continuer.', 401, 'AUTH_REQUIRED');
    if (session && csrf) auth.verifyCsrf(request, session);
    return {
      session,
      userId: session?.user?.id || 'anonymous'
    };
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const path = url.pathname;

      // ---------- endpoints publics et authentification ----------

      if (request.method === 'GET' && path === '/api/health') {
        const llm = getCachedLlmStatus();
        sendJson(response, 200, {
          ok: true,
          app: 'Yallah Viral Studio',
          contact: YALLAH_CONTACT,
          auth: {
            required: authRequired,
            registrationEnabled: auth.registrationEnabled,
            sessions: 'HttpOnly + SameSite=Lax + CSRF'
          },
          storage: store.info,
          videoRender: {
            engine: 'FFmpeg (libx264/AAC) + @napi-rs/canvas — open source',
            resolution: '720x1280 · 30 fps',
            voices: listAvailableVoices()
          },
          textEngine: llm.available
            ? { kind: 'llm', provider: llm.provider, model: llm.model }
            : { kind: 'templates' }
        });
        return;
      }

      if (request.method === 'GET' && path === '/api/auth/session') {
        const session = await auth.authenticate(request);
        sendJson(response, 200, session
          ? { authenticated: true, required: authRequired, user: session.user, csrfToken: session.csrfToken, expiresAt: session.expiresAt, registrationEnabled: auth.registrationEnabled }
          : { authenticated: false, required: authRequired, registrationEnabled: auth.registrationEnabled });
        return;
      }

      if (request.method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) {
        assertSameOrigin(request);
        limitAuth(request, path);
        const input = await readJsonBody(request);
        const result = path.endsWith('/register')
          ? await auth.register(input, request, response)
          : await auth.login(input, request, response);
        sendJson(response, path.endsWith('/register') ? 201 : 200, { authenticated: true, ...result });
        return;
      }

      if (request.method === 'POST' && path === '/api/auth/logout') {
        assertSameOrigin(request);
        const session = await auth.authenticate(request);
        if (session) auth.verifyCsrf(request, session);
        await auth.logout(request, response, session);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && path === '/api/voices') {
        const diagnostics = getVoiceDiagnostics();
        sendJson(response, 200, {
          renderReady: diagnostics.renderReady,
          neuralReady: diagnostics.neuralReady,
          voices: diagnostics.voices
        });
        return;
      }

      // ---------- API protégée par compte ----------

      // Mode simple : une phrase → brief interprété → contenu → affiche et/ou
      // job MP4. Le projet est sauvegardé dans la bibliothèque privée avant la
      // réponse, sans exposer d'étape technique à l'utilisateur.
      if (request.method === 'POST' && path === '/api/auto-create') {
        assertSameOrigin(request);
        const { userId } = await authContext(request, { csrf: true });
        limitAutomaticCreation(request, `auto-create:${userId}`);
        const body = await readJsonBody(request);
        const { prompt, output } = validateAutoCreationInput(body);
        const interpretation = interpretAutoRequest(prompt, { output });
        const creative = await generateCreativeLayer(interpretation.input);
        const project = generateStudioProject(interpretation.input, {
          creative: creative?.creative,
          textEngine: creative
            ? { kind: 'llm', provider: creative.provider, model: creative.model, note: 'Demande libre et textes enrichis par un LLM local open source, puis validés par le serveur.' }
            : undefined
        });
        project.automatic = {
          enabled: true,
          request: interpretation.request,
          output: interpretation.output,
          outputLabel: interpretation.outputLabel,
          posterFormat: interpretation.posterFormat,
          videoMode: interpretation.videoMode,
          service: interpretation.service,
          city: interpretation.city,
          language: interpretation.language,
          duration: interpretation.duration,
          style: interpretation.style,
          audience: interpretation.audience,
          effects: interpretation.effects,
          creativeDirection: interpretation.creativeDirection,
          interpretedAt: new Date().toISOString()
        };
        validateProject(project);

        let poster = null;
        if (interpretation.output === 'poster' || interpretation.output === 'both') {
          const canvas = await renderPoster(project, { format: interpretation.posterFormat });
          const png = canvas.toBuffer('image/png');
          poster = {
            format: interpretation.posterFormat,
            width: canvas.width,
            height: canvas.height,
            filename: posterFilename(project, interpretation.posterFormat),
            sizeBytes: png.length,
            dataUrl: `data:image/png;base64,${png.toString('base64')}`
          };
        }

        const savedProject = await store.saveProject(userId, project);
        let videoJob = null;
        const warnings = [];
        if (interpretation.output === 'video' || interpretation.output === 'both') {
          try {
            videoJob = createVideoJob(savedProject, {
              mode: interpretation.videoMode,
              voiceText: interpretation.videoMode === 'poster' ? savedProject.script.voiceOver : '',
              ownerId: userId
            });
          } catch (error) {
            // « Les deux » reste utile même si la file vidéo est momentanément
            // pleine : l'affiche et le projet sont déjà prêts. Vidéo seule,
            // en revanche, doit signaler l'échec normalement.
            if (interpretation.output === 'video') throw error;
            warnings.push(error.message || 'La vidéo n’a pas pu démarrer. Réessayez depuis le projet sauvegardé.');
          }
        }

        const { input: _generatedInput, ...publicInterpretation } = interpretation;
        sendJson(response, videoJob ? 202 : 200, {
          ok: true,
          output: interpretation.output,
          interpretation: publicInterpretation,
          project: savedProject,
          poster,
          videoJob,
          warnings
        });
        return;
      }

      if (request.method === 'POST' && path === '/api/generate') {
        assertSameOrigin(request);
        await authContext(request, { csrf: true });
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

      if (request.method === 'POST' && path === '/api/viralize') {
        assertSameOrigin(request);
        await authContext(request, { csrf: true });
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

      // ---------- bibliothèque persistante et isolée par utilisateur ----------

      if (path === '/api/projects' && request.method === 'GET') {
        const { userId } = await authContext(request);
        const projects = await store.listProjects(userId, { limit: url.searchParams.get('limit') });
        sendJson(response, 200, { projects });
        return;
      }

      if (path === '/api/projects' && request.method === 'POST') {
        assertSameOrigin(request);
        const { userId } = await authContext(request, { csrf: true });
        const body = await readJsonBody(request);
        const project = validateProject(body.project || body);
        sendJson(response, 200, { project: await store.saveProject(userId, project) });
        return;
      }

      if (path === '/api/projects' && request.method === 'DELETE') {
        assertSameOrigin(request);
        const { userId } = await authContext(request, { csrf: true });
        sendJson(response, 200, { ok: true, deleted: await store.clearProjects(userId) });
        return;
      }

      if (path.startsWith('/api/projects/')) {
        const id = decodePathValue(path.slice('/api/projects/'.length));
        const { userId } = await authContext(request, { csrf: request.method === 'DELETE' });
        if (request.method === 'GET') {
          const project = await store.getProject(userId, id);
          if (!project) throw httpError('Projet introuvable.', 404, 'PROJECT_NOT_FOUND');
          sendJson(response, 200, { project });
          return;
        }
        if (request.method === 'DELETE') {
          assertSameOrigin(request);
          const deleted = await store.deleteProject(userId, id);
          if (!deleted) throw httpError('Projet introuvable.', 404, 'PROJECT_NOT_FOUND');
          sendJson(response, 200, { ok: true });
          return;
        }
      }

      // ---------- rendu vidéo MP4 (pipeline open source serveur) ----------

      if (request.method === 'POST' && path === '/api/video-render') {
        assertSameOrigin(request);
        const { userId } = await authContext(request, { csrf: true });
        const body = await readJsonBody(request);
        const project = body.project || body;
        const mode = body.mode === 'poster' ? 'poster' : 'scenario';
        const voiceText = String(body.voiceText || '').trim();
        validateProject(project);
        if (voiceText.length > 5_000) {
          throw httpError('Texte de voix off trop long.', 413, 'VOICE_TOO_LARGE');
        }
        if (mode === 'poster' && !voiceText && !project?.script?.voiceOver) {
          throw httpError('Fournissez un texte de voix off pour la vidéo d’affiche.', 400, 'VOICE_REQUIRED');
        }
        sendJson(response, 202, createVideoJob(project, { mode, voiceText, ownerId: userId }));
        return;
      }

      if (request.method === 'POST' && path === '/api/poster-render') {
        assertSameOrigin(request);
        await authContext(request, { csrf: true });
        const body = await readJsonBody(request);
        const project = validateProject(body.project || body);
        const format = body.format === 'square' ? 'square' : 'story';
        const canvas = await renderPoster(project, { format });
        const png = canvas.toBuffer('image/png');
        sendJson(response, 200, {
          format,
          filename: posterFilename(project, format),
          sizeBytes: png.length,
          dataUrl: `data:image/png;base64,${png.toString('base64')}`
        });
        return;
      }

      if (request.method === 'GET' && path.startsWith('/api/video-status/')) {
        const { userId } = await authContext(request);
        const jobId = decodePathValue(path.slice('/api/video-status/'.length));
        const job = getVideoJob(jobId, userId);
        if (!job) throw httpError('Rendu introuvable ou expiré.', 404, 'RENDER_NOT_FOUND');
        sendJson(response, 200, job);
        return;
      }

      if (request.method === 'GET' && path.startsWith('/api/video-file/')) {
        const { userId } = await authContext(request);
        const jobId = decodePathValue(path.slice('/api/video-file/'.length));
        const job = getVideoJob(jobId, userId);
        const filePath = getVideoJobFilePath(jobId, 'video', userId);
        if (!job || !filePath) throw httpError('Vidéo introuvable ou rendu pas encore terminé.', 404, 'VIDEO_NOT_FOUND');
        try {
          const file = await readFile(filePath);
          response.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': file.length,
            'Content-Disposition': `attachment; filename="${job.filename}"; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
            'Cache-Control': 'no-store',
            ...securityHeaders('video/mp4')
          });
          response.end(file);
        } catch {
          throw httpError('Fichier de rendu expiré.', 410, 'VIDEO_EXPIRED');
        }
        return;
      }

      if (request.method === 'GET' && path.startsWith('/api/video-poster/')) {
        const { userId } = await authContext(request);
        const jobId = decodePathValue(path.slice('/api/video-poster/'.length));
        const filePath = getVideoJobFilePath(jobId, 'poster', userId);
        if (!filePath) throw httpError('Affiche introuvable.', 404, 'POSTER_NOT_FOUND');
        try {
          const file = await readFile(filePath);
          response.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': file.length,
            'Cache-Control': 'no-store',
            ...securityHeaders('image/jpeg')
          });
          response.end(file);
        } catch {
          throw httpError('Affiche expirée.', 410, 'POSTER_EXPIRED');
        }
        return;
      }

      if (request.method === 'GET' && path === '/api/llm-status') {
        await authContext(request);
        sendJson(response, 200, await detectLlm({ force: true }));
        return;
      }

      if (path.startsWith('/api/')) {
        if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(request.method)) {
          throw httpError('Méthode non autorisée.', 405, 'METHOD_NOT_ALLOWED');
        }
        throw httpError('Endpoint API introuvable.', 404, 'API_NOT_FOUND');
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw httpError('Méthode non autorisée.', 405, 'METHOD_NOT_ALLOWED');
      }
      await serveStatic(request, response);
    } catch (error) {
      sendError(response, error);
    }
  });

  server.dataStore = store;
  server.authRequired = authRequired;
  server.closeResources = async () => {
    if (ownsStore) await store.close();
  };
  return server;
}

export async function startStudioServer({ port = DEFAULT_PORT, host = DEFAULT_HOST, ...options } = {}) {
  const server = await createStudioServer(options);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  console.log(`Yallah Viral Studio running on http://${host}:${address.port}`);
  detectLlm().then(status => {
    console.log(status.available
      ? `[llm] moteur texte : ${status.provider} (${status.model})`
      : '[llm] aucun LLM local détecté — moteur templates (voir docs/llm-local.md pour brancher)');
  });
  return server;
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  await startStudioServer();
}
