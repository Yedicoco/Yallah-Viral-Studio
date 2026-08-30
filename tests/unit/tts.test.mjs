import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeWavPcm16 } from '../../lib/audio.mjs';
import { getVoiceDiagnostics, listAvailableVoices, synthesizeSceneVoice } from '../../lib/tts.mjs';

test('le diagnostic vocal couvre toutes les langues sans prétendre que Piper est prêt', () => {
  const voices = listAvailableVoices();
  assert.deepEqual(voices.map(voice => voice.language), ['fr', 'darija', 'ar']);
  for (const voice of voices) {
    assert.equal(typeof voice.ready, 'boolean');
    assert.ok(['piper', 'espeak-ng', 'unavailable'].includes(voice.engine));
    if (voice.engine !== 'piper') assert.equal(voice.recommended, false);
  }
  const diagnostics = getVoiceDiagnostics();
  assert.equal(diagnostics.voices.length, 3);
  assert.equal(diagnostics.neuralReady, voices.every(voice => voice.engine === 'piper'));
});

test('le diagnostic respecte un moteur explicitement forcé', () => {
  const previous = process.env.YVS_TTS_ENGINE;
  try {
    process.env.YVS_TTS_ENGINE = 'piper';
    assert.equal(listAvailableVoices().some(voice => voice.engine === 'espeak-ng'), false);
    process.env.YVS_TTS_ENGINE = 'espeak';
    assert.equal(listAvailableVoices().some(voice => voice.engine === 'piper'), false);
  } finally {
    if (previous === undefined) delete process.env.YVS_TTS_ENGINE;
    else process.env.YVS_TTS_ENGINE = previous;
  }
});

test('la synthèse refuse les entrées vides ou démesurées avant de lancer un processus', async () => {
  const output = join(tmpdir(), 'yvs-tts-input-limit.wav');
  await assert.rejects(
    synthesizeSceneVoice({ text: '   ', language: 'fr', outFile: output }),
    /vide/
  );
  await assert.rejects(
    synthesizeSceneVoice({ text: 'x'.repeat(5_001), language: 'fr', outFile: output }),
    /5000 caractères/
  );
});

test('le moteur de secours produit un vrai WAV', async t => {
  const diagnostics = getVoiceDiagnostics();
  if (!diagnostics.renderReady) {
    t.skip('Runtime TTS absent : exécuter npm run setup:voices -- --runtime-only');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'yvs-tts-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'voice.wav');
  const clip = await synthesizeSceneVoice({
    text: 'Bonjour, ceci est un test Yallah.',
    language: 'fr',
    outFile: output,
    sceneBudgetSeconds: 3
  });
  const wav = decodeWavPcm16(await readFile(output));
  assert.ok(clip.durationSeconds > 0.2);
  assert.ok(wav.samples.length > 4_000);
  assert.equal(wav.sampleRate, 22_050);
  assert.ok(['piper', 'espeak-ng'].includes(clip.engine));
});
