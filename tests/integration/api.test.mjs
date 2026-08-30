import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStudioServer } from '../../server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function makeClient(baseUrl) {
  let cookie = '';
  let csrf = '';
  return {
    get cookie() { return cookie; },
    get csrf() { return csrf; },
    async request(path, { method = 'GET', payload, withCsrf = true } = {}) {
      const headers = { Accept: 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (payload !== undefined) headers['Content-Type'] = 'application/json';
      if (withCsrf && csrf && !['GET', 'HEAD'].includes(method)) headers['X-YVS-CSRF'] = csrf;
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload)
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = await response.json().catch(() => null);
      if (data?.csrfToken) csrf = data.csrfToken;
      return { response, data };
    }
  };
}

test('API : auth, CSRF et bibliothèque multi-utilisateur', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yvs-api-test-'));
  const server = await createStudioServer({
    databaseUrl: `file:${join(dir, 'api.db')}`,
    sessionSecret: 'integration-test-secret-that-is-not-production',
    secureCookie: false,
    registrationEnabled: true
  });
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await server.closeResources();
    await rm(dir, { recursive: true, force: true });
  });

  const anonymous = makeClient(baseUrl);
  let result = await anonymous.request('/api/health');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.auth.required, true);
  assert.equal(result.data.storage.multiUser, true);

  result = await anonymous.request('/api/generate', {
    method: 'POST', payload: { city: 'Casablanca' }, withCsrf: false
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.data.code, 'AUTH_REQUIRED');

  const alice = makeClient(baseUrl);
  result = await alice.request('/api/auth/register', {
    method: 'POST',
    payload: { displayName: 'Alice', email: 'alice@example.com', password: 'Solide-2026' },
    withCsrf: false
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.authenticated, true);
  assert.equal(result.data.user.email, 'alice@example.com');
  assert.match(alice.cookie, /^yvs_session=/);
  assert.ok(alice.csrf.length > 20);

  result = await alice.request('/api/generate', {
    method: 'POST', payload: { city: 'Casablanca', service: 'menage', duration: 15 }, withCsrf: false
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, 'INVALID_CSRF');

  result = await alice.request('/api/generate', {
    method: 'POST',
    payload: { objective: 'Test API', city: 'Casablanca', service: 'menage', duration: 15, style: 'viral', language: 'fr' }
  });
  assert.equal(result.response.status, 200);
  const project = result.data;
  assert.equal(project.input.city, 'Casablanca');
  assert.equal(project.script.scenes.length, 4);

  result = await alice.request('/api/projects', { method: 'POST', payload: { project } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.project.id, project.id);

  result = await alice.request('/api/projects');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.projects.length, 1);

  const bob = makeClient(baseUrl);
  result = await bob.request('/api/auth/register', {
    method: 'POST',
    payload: { displayName: 'Bob', email: 'bob@example.com', password: 'Autre-2026' },
    withCsrf: false
  });
  assert.equal(result.response.status, 201);
  result = await bob.request('/api/projects');
  assert.equal(result.data.projects.length, 0);
  result = await bob.request(`/api/projects/${encodeURIComponent(project.id)}`);
  assert.equal(result.response.status, 404);

  result = await alice.request(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
  assert.equal(result.response.status, 200);
  result = await alice.request('/api/projects');
  assert.equal(result.data.projects.length, 0);

  result = await alice.request('/api/auth/logout', { method: 'POST' });
  assert.equal(result.response.status, 200);
  result = await alice.request('/api/auth/session');
  assert.equal(result.data.authenticated, false);
});

test('API automatique : une demande crée, rend et sauvegarde une affiche privée', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yvs-auto-api-test-'));
  const server = await createStudioServer({
    databaseUrl: `file:${join(dir, 'api.db')}`,
    sessionSecret: 'automatic-integration-test-secret',
    secureCookie: false,
    registrationEnabled: true
  });
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await server.closeResources();
    await rm(dir, { recursive: true, force: true });
  });

  const anonymous = makeClient(baseUrl);
  let result = await anonymous.request('/api/auto-create', {
    method: 'POST',
    payload: { prompt: 'Une affiche pour une nounou à Rabat', output: 'poster' },
    withCsrf: false
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.data.code, 'AUTH_REQUIRED');

  const client = makeClient(baseUrl);
  result = await client.request('/api/auth/register', {
    method: 'POST',
    payload: { displayName: 'Auto', email: 'auto@example.com', password: 'Solide-2026' },
    withCsrf: false
  });
  assert.equal(result.response.status, 201);

  result = await client.request('/api/auto-create', {
    method: 'POST',
    payload: {
      prompt: 'Une affiche carrée premium pour une nounou à Rabat, en français, avec lumière dorée.',
      output: 'poster'
    },
    withCsrf: false
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.data.code, 'INVALID_CSRF');

  result = await client.request('/api/auto-create', {
    method: 'POST', payload: { prompt: 'pub', output: 'poster' }
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.data.code, 'AUTO_PROMPT_TOO_SHORT');

  result = await client.request('/api/auto-create', {
    method: 'POST',
    payload: {
      prompt: 'Une affiche carrée premium pour une nounou à Rabat, en français, avec lumière dorée.',
      output: 'poster'
    }
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.ok, true);
  assert.equal(result.data.output, 'poster');
  assert.equal(result.data.interpretation.service, 'nounou');
  assert.equal(result.data.interpretation.city, 'Rabat');
  assert.equal(result.data.interpretation.posterFormat, 'square');
  assert.equal(result.data.project.automatic.enabled, true);
  assert.equal(result.data.project.input.creativeDirection.includes('Lumière dorée'), true);
  assert.equal(result.data.poster.format, 'square');
  assert.equal(result.data.poster.width, 1080);
  assert.equal(result.data.poster.height, 1080);
  assert.ok(result.data.poster.sizeBytes > 10_000);
  assert.match(result.data.poster.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.data.videoJob, null);
  const automaticProjectId = result.data.project.id;

  result = await client.request('/api/projects');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.projects.length, 1);
  assert.equal(result.data.projects[0].id, automaticProjectId);
  assert.equal(result.data.projects[0].automatic.request.includes('nounou'), true);
});

test('le frontend est servi avec des en-têtes de sécurité compatibles preview', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yvs-static-test-'));
  const server = await createStudioServer({
    databaseUrl: `file:${join(dir, 'api.db')}`,
    secureCookie: false,
    sessionSecret: 'static-test-secret'
  });
  const baseUrl = await listen(server);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await server.closeResources();
    await rm(dir, { recursive: true, force: true });
  });

  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.has('x-frame-options'), false);
  const html = await response.text();
  assert.match(html, /auth-overlay/);
  assert.match(html, /auto-studio-form/);
  assert.match(html, /Créer automatiquement/);

  const stylesheet = await fetch(`${baseUrl}/src/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get('content-type'), /text\/css/);
  const sharedRenderer = await fetch(`${baseUrl}/lib/frame-draw.mjs`);
  assert.equal(sharedRenderer.status, 200);
  assert.match(sharedRenderer.headers.get('content-type'), /text\/javascript/);

  for (const privatePath of ['/server.mjs', '/package.json', '/.env', '/data/yallah-studio.db']) {
    const privateResponse = await fetch(`${baseUrl}${privatePath}`);
    assert.equal(privateResponse.status, 404, `${privatePath} ne doit jamais être servi`);
    assert.equal(await privateResponse.text(), 'Not found');
  }
});
