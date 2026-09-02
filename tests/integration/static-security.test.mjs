import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioServer } from '../../server.mjs';

async function withServer(run) {
  const server = await createStudioServer({
    databaseUrl: 'file::memory:',
    sessionSecret: 'static-security-test',
    secureCookie: false,
    registrationEnabled: true
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await server.closeResources();
  }
}

test('statique : sert l’interface sans exposer le code serveur', async () => {
  await withServer(async base => {
    // La page racine est servie (SPA).
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type') || '', /text\/html/);

    // Le frontend (assett public) est bien servi.
    const js = await fetch(`${base}/src/main.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') || '', /javascript/);

    // Les fichiers du backend ne doivent jamais être exposés.
    for (const backendPath of ['/server.mjs', '/lib/auth.mjs', '/lib/store.mjs',
      '/package.json', '/.env', '/.env.example', '/README.md',
      '/tests/integration/api.test.mjs']) {
      const res = await fetch(`${base}${backendPath}`);
      assert.equal(res.status, 404, `Le fichier ${backendPath} ne doit pas être exposé.`);
    }
  });
});

test('statique : refuse la traversée de chemin', async () => {
  await withServer(async base => {
    // Tentatives d’évasion hors de la racine du dépôt.
    const attempts = [
      '/..%2F..%2Fetc%2Fpasswd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/../../server.mjs',
      '/..%5cserver.mjs',
      '/server.mjs%00.html',
      '/%2e%2e%2fserver.mjs'
    ];
    for (const path of attempts) {
      const res = await fetch(`${base}${path}`);
      // Soit 403 (accès refusé), soit 404 (not found) — jamais un fichier sensible.
      assert.ok(
        [400, 403, 404].includes(res.status),
        `${path} doit être refusé (reçu ${res.status})`
      );
      const body = await res.text();
      assert.doesNotMatch(body, /scrypt\$|createHash|module\.exports|app\.get\(/,
        `${path} n’a pas dû renvoyer du code serveur.`);
    }
  });
});

test('statique : renvoie des en-têtes de sécurité sur la page', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /media-src 'self' blob:/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('referrer-policy') || '', /strict-origin-when-cross-origin/);
  });
});
