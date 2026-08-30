import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDataStore } from '../../lib/store.mjs';
import { generateStudioProject } from '../../lib/generator.mjs';

test('le stockage persiste et isole les projets par utilisateur', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yvs-store-test-'));
  const databaseUrl = `file:${join(dir, 'test.db')}`;
  const store = await createDataStore({ url: databaseUrl });
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  const now = new Date().toISOString();
  const alice = await store.createUser({
    id: 'alice', email: 'alice@example.com', displayName: 'Alice', passwordHash: 'hash-a', createdAt: now
  });
  const bob = await store.createUser({
    id: 'bob', email: 'bob@example.com', displayName: 'Bob', passwordHash: 'hash-b', createdAt: now
  });
  assert.equal((await store.getUserByEmail('ALICE@example.com')).id, alice.id);
  assert.equal((await store.getUserById(bob.id)).email, bob.email);

  const project = generateStudioProject({ city: 'Casablanca', service: 'menage', duration: 15 });
  await store.saveProject(alice.id, project);
  assert.equal((await store.listProjects(alice.id)).length, 1);
  assert.equal((await store.listProjects(bob.id)).length, 0);
  assert.equal((await store.getProject(bob.id, project.id)), null);

  // Un même identifiant client peut exister chez deux propriétaires sans
  // écraser ni transférer le projet de l'autre compte.
  await store.saveProject(bob.id, { ...project, title: 'Copie privée Bob' });
  assert.equal((await store.getProject(bob.id, project.id)).title, 'Copie privée Bob');
  assert.notEqual((await store.getProject(alice.id, project.id)).title, 'Copie privée Bob');

  const changed = { ...project, title: 'Titre mis à jour' };
  await store.saveProject(alice.id, changed);
  const loaded = await store.getProject(alice.id, project.id);
  assert.equal(loaded.title, changed.title);
  assert.ok(loaded.savedAt);

  await store.createSession({
    tokenHash: 'token-hash', userId: alice.id, createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const session = await store.getSession('token-hash');
  assert.equal(session.user.id, alice.id);
  await store.deleteSession('token-hash');
  assert.equal(await store.getSession('token-hash'), null);

  assert.equal(await store.deleteProject(bob.id, project.id), true);
  assert.equal((await store.getProject(alice.id, project.id)).title, changed.title);
  assert.equal(await store.deleteProject(alice.id, project.id), true);
  assert.equal((await store.listProjects(alice.id)).length, 0);
});

test('les emails sont uniques sans tenir compte de la casse', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yvs-store-unique-'));
  const store = await createDataStore({ url: `file:${join(dir, 'test.db')}` });
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const input = { displayName: 'Test', passwordHash: 'hash', createdAt: new Date().toISOString() };
  await store.createUser({ ...input, id: 'one', email: 'user@example.com' });
  await assert.rejects(
    store.createUser({ ...input, id: 'two', email: 'USER@example.com' }),
    /unique|constraint/i
  );
});
