import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStudioProject, improveStudioProject, YALLAH_CONTACT } from '../../lib/generator.mjs';

const baseInput = {
  objective: 'Trouver une aide fiable',
  city: 'Casablanca',
  service: 'menage',
  duration: 30,
  style: 'viral',
  language: 'fr'
};

test('generateStudioProject construit un projet complet et cohérent', () => {
  const project = generateStudioProject(baseInput);
  assert.match(project.id, /^yvs-/);
  assert.equal(project.script.scenes.length, 6);
  assert.equal(project.script.duration, 30);
  assert.equal(project.subtitles.length, project.script.scenes.length);
  assert.equal(project.contact.gsm, YALLAH_CONTACT.gsm);
  assert.ok(project.caption.includes(YALLAH_CONTACT.email));
  assert.ok(project.caption.includes(YALLAH_CONTACT.tiktok.handle));
  assert.ok(project.cta.includes(YALLAH_CONTACT.gsm));
  assert.ok(project.optimization.score >= 72);
});

test('les entrées invalides retombent sur des valeurs sûres', () => {
  const project = generateStudioProject({
    ...baseInput,
    service: 'inconnu',
    style: 'pirate',
    language: 'xx',
    duration: 999,
    whatsapp: '<script>alert(1)</script>',
    email: 'pas-un-email',
    tiktok: '!!!',
    instagram: 'https://instagram.com/'
  });
  assert.equal(project.input.service, 'menage');
  assert.equal(project.input.style, 'viral');
  assert.equal(project.input.language, 'fr');
  assert.equal(project.input.duration, 30);
  assert.equal(project.contact.gsm, YALLAH_CONTACT.gsm);
  assert.equal(project.contact.email, YALLAH_CONTACT.email);
  assert.equal(project.contact.tiktok.handle, YALLAH_CONTACT.tiktok.handle);
  assert.equal(project.contact.instagram.handle, YALLAH_CONTACT.instagram.handle);
  assert.doesNotMatch(project.script.voiceOver, /<script>/);
});

test('les trois langues et les trois durées produisent une timeline continue', () => {
  for (const language of ['fr', 'darija', 'ar']) {
    for (const [duration, sceneCount] of [[15, 4], [30, 6], [60, 8]]) {
      const project = generateStudioProject({ ...baseInput, language, duration });
      assert.equal(project.script.scenes.length, sceneCount);
      assert.equal(project.script.duration, duration);
      let cursor = 0;
      for (const scene of project.script.scenes) {
        assert.equal(scene.startAt, cursor);
        cursor += scene.duration;
      }
      assert.equal(cursor, duration);
      assert.equal(project.voice.direction, language === 'ar' ? 'rtl' : 'ltr');
    }
  }
});

test('la couche créative ne peut pas supprimer le CTA officiel', () => {
  const project = generateStudioProject(baseInput, {
    creative: {
      hooks: ['Un hook original'],
      scenes: Array.from({ length: 6 }, () => ({
        voice: 'Texte créatif sans contact.',
        onScreenText: 'Texte écran sans contact.'
      })),
      caption: 'Caption créative',
      hashtags: ['Nouveau', '#YallahServices', 'tag invalide !']
    }
  });
  const last = project.script.scenes.at(-1);
  assert.ok(last.voice.replace(/\s/g, '').includes(YALLAH_CONTACT.gsm.replace(/\D/g, '')));
  assert.ok(last.onScreenText.replace(/\s/g, '').includes(YALLAH_CONTACT.gsm.replace(/\D/g, '')));
  assert.equal(project.hashtags[0], '#YallahServices');
  assert.ok(project.hooks.length >= 5);
});

test('la direction créative automatique est conservée dans le projet et les prompts', () => {
  const project = generateStudioProject({
    ...baseInput,
    creativeDirection: 'Lumière dorée, zoom dynamique et effet avant/après',
    effects: ['Lumière dorée', 'Zoom dynamique', 'Avant / après']
  });
  assert.equal(project.input.creativeDirection, 'Lumière dorée, zoom dynamique et effet avant/après');
  assert.deepEqual(project.input.effects, ['Lumière dorée', 'Zoom dynamique', 'Avant / après']);
  assert.ok(project.script.scenes.every(scene => scene.prompt.includes('Direction créative demandée')));
});

test('improveStudioProject conserve le lien avec la version précédente', () => {
  const original = generateStudioProject({ ...baseInput, style: 'luxe' });
  const improved = improveStudioProject(original);
  assert.equal(improved.previousProjectId, original.id);
  assert.equal(improved.style.code, 'viral');
  assert.equal(improved.viralBoost, true);
  assert.equal(improved.optimization.before, original.optimization.score);
  assert.ok(improved.improvementNotes.length >= 3);
});
