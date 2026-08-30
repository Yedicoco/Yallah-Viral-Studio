import test from 'node:test';
import assert from 'node:assert/strict';
import { authInternals } from '../../lib/auth.mjs';

test('normalisation email et politique de mot de passe', () => {
  assert.equal(authInternals.normalizeEmail('  TEST@Example.COM '), 'test@example.com');
  assert.match(authInternals.passwordError('court1'), /10 caractères/);
  assert.match(authInternals.passwordError('seulementdeslettres'), /lettre et un chiffre/);
  assert.equal(authInternals.passwordError('Solide-2026'), null);
});

test('les mots de passe sont hachés avec scrypt et vérifiés en temps sûr', async () => {
  const encoded = await authInternals.hashPassword('MotDePasse-2026');
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes('MotDePasse-2026'), false);
  assert.equal(await authInternals.verifyPassword('MotDePasse-2026', encoded), true);
  assert.equal(await authInternals.verifyPassword('Mauvais-2026', encoded), false);
  assert.equal(await authInternals.verifyPassword('MotDePasse-2026', 'invalide'), false);
});
