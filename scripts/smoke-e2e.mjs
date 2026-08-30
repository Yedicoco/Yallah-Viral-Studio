#!/usr/bin/env node
// Smoke test réel : compte → génération → stockage → affiche → voix → MP4.
// Le projet est réduit à une scène de 2 s pour tester le pipeline de production
// complet sans fabriquer une vidéo de 30 s à chaque CI.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { createStudioServer } from '../server.mjs';
import { getVideoJobFilePath } from '../lib/video-jobs.mjs';
import { getVoiceDiagnostics } from '../lib/tts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = join(root, '.artifacts');
const reportPath = join(artifactsDir, 'e2e-smoke-report.json');
const videoPath = join(artifactsDir, 'e2e-smoke-video.mp4');
const posterPath = join(artifactsDir, 'e2e-smoke-poster.png');
const tempDir = await mkdtemp(join(tmpdir(), 'yvs-e2e-'));
const startedAt = Date.now();
let server;
let renderWorkDir;

function log(step, detail = '') {
  console.log(`\n[smoke] ${step}${detail ? ` — ${detail}` : ''}`);
}

function makeClient(baseUrl) {
  let cookie = '';
  let csrf = '';
  return {
    get csrf() { return csrf; },
    async request(path, { method = 'GET', payload, csrfEnabled = true, binary = false } = {}) {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      if (payload !== undefined) headers['Content-Type'] = 'application/json';
      if (csrfEnabled && csrf && !['GET', 'HEAD'].includes(method)) headers['X-YVS-CSRF'] = csrf;
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload)
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = binary
        ? Buffer.from(await response.arrayBuffer())
        : await response.json().catch(() => ({ error: response.statusText }));
      if (!binary && data.csrfToken) csrf = data.csrfToken;
      if (!response.ok) {
        const error = new Error(data.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.code;
        throw error;
      }
      return { response, data };
    }
  };
}

function tinyProject(project) {
  const scene = {
    ...project.script.scenes[0],
    id: 'scene-smoke',
    number: 1,
    duration: 2,
    startAt: 0,
    voice: 'Yallah Services, votre solution à Casablanca.',
    caption: 'Votre solution à Casablanca.',
    onScreenText: 'Yallah Services à Casablanca'
  };
  return {
    ...project,
    title: 'Smoke test Yallah',
    script: {
      ...project.script,
      duration: 2,
      targetDuration: 2,
      voiceOver: scene.voice,
      scenes: [scene]
    },
    subtitles: [{ start: 0, end: 2, text: scene.caption }]
  };
}

const report = {
  ok: false,
  startedAt: new Date(startedAt).toISOString(),
  steps: {}
};

try {
  await mkdir(artifactsDir, { recursive: true });
  const diagnostics = getVoiceDiagnostics();
  assert.equal(diagnostics.renderReady, true,
    'Runtime TTS absent. Exécutez `npm run setup:voices -- --runtime-only`.');
  report.steps.voiceProvisioning = {
    renderReady: diagnostics.renderReady,
    neuralReady: diagnostics.neuralReady,
    voices: diagnostics.voices
  };

  server = await createStudioServer({
    databaseUrl: `file:${join(tempDir, 'smoke.db')}`,
    sessionSecret: randomBytes(32).toString('hex'),
    secureCookie: false,
    registrationEnabled: true
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const client = makeClient(baseUrl);

  log('1/6 Authentification');
  const email = `smoke-${Date.now()}@example.test`;
  const registration = await client.request('/api/auth/register', {
    method: 'POST',
    csrfEnabled: false,
    payload: { displayName: 'Smoke E2E', email, password: 'Smoke-test-2026' }
  });
  assert.equal(registration.data.authenticated, true);
  const ownerId = registration.data.user.id;
  report.steps.authentication = { ok: true, userId: ownerId };

  log('2/6 Génération du projet');
  const generated = await client.request('/api/generate', {
    method: 'POST',
    payload: {
      objective: 'Valider le pipeline complet', city: 'Casablanca', service: 'menage',
      duration: 15, style: 'viral', language: 'fr'
    }
  });
  const project = tinyProject(generated.data);
  assert.equal(project.script.scenes.length, 1);
  report.steps.generation = { ok: true, projectId: project.id, originalSceneCount: generated.data.script.scenes.length };

  log('3/6 Stockage multi-utilisateur');
  await client.request('/api/projects', { method: 'POST', payload: { project } });
  const library = await client.request('/api/projects');
  assert.equal(library.data.projects.some(item => item.id === project.id), true);
  report.steps.storage = { ok: true, backend: server.dataStore.info.kind, projectCount: library.data.projects.length };

  log('4/6 Rendu affiche PNG');
  const poster = await client.request('/api/poster-render', {
    method: 'POST', payload: { project, format: 'story' }
  });
  const png = Buffer.from(poster.data.dataUrl.split(',')[1], 'base64');
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1920);
  assert.ok(png.length > 100_000);
  await writeFile(posterPath, png);
  report.steps.poster = { ok: true, width: 1080, height: 1920, sizeBytes: png.length };

  log('5/6 Synthèse vocale et rendu MP4');
  const voices = await client.request('/api/voices');
  const frenchVoice = voices.data.voices.find(voice => voice.language === 'fr');
  assert.equal(frenchVoice.ready, true);
  const queued = await client.request('/api/video-render', {
    method: 'POST', payload: { project, mode: 'scenario' }
  });
  const jobId = queued.data.id;
  const deadline = Date.now() + 5 * 60 * 1000;
  let status;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    status = (await client.request(`/api/video-status/${encodeURIComponent(jobId)}`)).data;
    process.stdout.write(`\r[smoke] ${String(Math.round(status.progress * 100)).padStart(3)} % — ${status.stage}        `);
    if (status.status === 'done' || status.status === 'error') break;
  }
  process.stdout.write('\n');
  assert.ok(status, 'Aucun statut de rendu reçu');
  assert.notEqual(status.status, 'error', status.error);
  assert.equal(status.status, 'done', 'Le rendu a dépassé le délai du smoke test');
  assert.equal(status.progress, 1);

  const sourceVideo = getVideoJobFilePath(jobId, 'video', ownerId);
  if (sourceVideo) renderWorkDir = dirname(sourceVideo);
  const video = await client.request(`/api/video-file/${encodeURIComponent(jobId)}`, { binary: true });
  assert.match(video.response.headers.get('content-type'), /video\/mp4/);
  assert.ok(video.data.length > 20_000);
  assert.ok(video.data.includes(Buffer.from('ftyp')));
  assert.ok(video.data.includes(Buffer.from('moov')));
  assert.ok(video.data.includes(Buffer.from('mdat')));
  await writeFile(videoPath, video.data);

  log('6/6 Validation des flux H.264 + AAC');
  const probe = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-i', videoPath], { encoding: 'utf8' });
  const mediaInfo = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  assert.match(mediaInfo, /Video: h264/i);
  assert.match(mediaInfo, /720x1280/);
  assert.match(mediaInfo, /30 fps/);
  assert.match(mediaInfo, /Audio: aac/i);

  // Un autre compte ne doit pas pouvoir lire le rendu du premier.
  const outsider = makeClient(baseUrl);
  await outsider.request('/api/auth/register', {
    method: 'POST', csrfEnabled: false,
    payload: { displayName: 'Isolation', email: `isolation-${Date.now()}@example.test`, password: 'Isolation-2026' }
  });
  let isolationStatus = null;
  try {
    await outsider.request(`/api/video-status/${encodeURIComponent(jobId)}`);
  } catch (error) {
    isolationStatus = error.status;
  }
  assert.equal(isolationStatus, 404);

  report.steps.video = {
    ok: true,
    jobId,
    voiceEngine: status.voiceEngine,
    durationSeconds: status.video.durationSeconds,
    sizeBytes: video.data.length,
    codecValidation: ['H.264', 'AAC', '720x1280', '30 fps'],
    ownerIsolation: true
  };
  report.ok = true;
  report.finishedAt = new Date().toISOString();
  report.elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  report.artifacts = {
    poster: '.artifacts/e2e-smoke-poster.png',
    video: '.artifacts/e2e-smoke-video.mp4'
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n✅ Smoke E2E réussi en ${report.elapsedSeconds}s`);
  console.log(`   Rapport : ${reportPath}`);
  console.log(`   Vidéo   : ${videoPath}`);
} catch (error) {
  report.error = error.stack || error.message;
  report.finishedAt = new Date().toISOString();
  report.elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n❌ Smoke E2E en échec : ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (server) await server.closeResources();
  if (renderWorkDir) await rm(renderWorkDir, { recursive: true, force: true });
  await rm(tempDir, { recursive: true, force: true });
}
