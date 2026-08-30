import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretAutoRequest } from '../../lib/auto-brief.mjs';

test('interprète un brief français complet et le choix Les deux', () => {
  const result = interpretAutoRequest(
    'Je veux une affiche carrée et une vidéo luxe de 15 secondes pour une nounou à Rabat, avec lumière dorée et zoom dynamique.',
    { output: 'both' }
  );

  assert.equal(result.output, 'both');
  assert.equal(result.service, 'nounou');
  assert.equal(result.city, 'Rabat');
  assert.equal(result.language, 'fr');
  assert.equal(result.duration, 15);
  assert.equal(result.style, 'luxe');
  assert.equal(result.posterFormat, 'square');
  assert.ok(result.effects.includes('Lumière dorée'));
  assert.ok(result.effects.includes('Zoom dynamique'));
  assert.equal(result.input.creativeDirection, result.creativeDirection);
  assert.deepEqual(result.input.effects, result.effects);
});

test('détecte la darija latine, Casablanca et une direction avant/après', () => {
  const result = interpretAutoRequest(
    'Bghit video viral b darija dyal femme de menage f Casa 30 sec, effet avant après.',
    { output: 'video' }
  );

  assert.equal(result.output, 'video');
  assert.equal(result.service, 'menage');
  assert.equal(result.city, 'Casablanca');
  assert.equal(result.language, 'darija');
  assert.equal(result.duration, 30);
  assert.equal(result.style, 'viral');
  assert.ok(result.effects.includes('Avant / après'));
});

test('comprend une demande arabe avec durée et ville marocaines', () => {
  const result = interpretAutoRequest(
    'أريد فيديو سينمائي بالعربية لخدمة تنظيف المنزل في مراكش لمدة 60 ثانية',
    { output: 'video' }
  );

  assert.equal(result.service, 'menage');
  assert.equal(result.city, 'Marrakech');
  assert.equal(result.language, 'ar');
  assert.equal(result.duration, 60);
  assert.equal(result.style, 'storytelling');
  assert.ok(result.effects.includes('Cinématique'));
});

test('conserve un effet libre et adapte une durée au format supporté', () => {
  const result = interpretAutoRequest(
    'Une publicité pour Yallah Services à Tanger en 20 secondes avec un effet papier découpé bleu nuit.',
    { output: 'poster' }
  );

  assert.equal(result.output, 'poster', 'le choix explicite de l’interface reste prioritaire');
  assert.equal(result.service, 'yallah');
  assert.equal(result.city, 'Tanger');
  assert.equal(result.requestedDuration, 20);
  assert.equal(result.duration, 15);
  assert.ok(result.effects.some(effect => /papier découpé bleu nuit/i.test(effect)));
  assert.match(result.input.objective, /papier découpé/i);
});

test('infère le résultat depuis la phrase quand aucun choix explicite n’est envoyé', () => {
  assert.equal(interpretAutoRequest('Crée une affiche pour une cuisinière à Agadir').output, 'poster');
  assert.equal(interpretAutoRequest('Crée une vidéo pour une auxiliaire de vie à Fès').output, 'video');
  assert.equal(interpretAutoRequest('Crée une affiche et une vidéo pour Airbnb à Dakhla').output, 'both');
});
