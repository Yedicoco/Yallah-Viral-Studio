import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_SAMPLE_RATE,
  buildRenderTimeline,
  composeMusicBed,
  decodeWavPcm16,
  encodeWavPcm16,
  mixVoiceAndMusic,
  resampleLinear
} from '../../lib/audio.mjs';

test('WAV PCM16 encode/decode conserve durée, fréquence et signal', () => {
  const samples = Float32Array.from({ length: 1_000 }, (_, index) => Math.sin(index / 10) * 0.5);
  const wav = encodeWavPcm16(samples, 16_000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  const decoded = decodeWavPcm16(wav);
  assert.equal(decoded.sampleRate, 16_000);
  assert.equal(decoded.samples.length, samples.length);
  assert.ok(Math.abs(decoded.samples[250] - samples[250]) < 0.001);
});

test('decodeWavPcm16 rejette les données qui ne sont pas un WAV', () => {
  assert.throws(() => decodeWavPcm16(Buffer.from('not a wav')), /WAV invalide/);
});

test('resampleLinear change la fréquence sans modifier la durée', () => {
  const source = Float32Array.from({ length: 8_000 }, (_, index) => index / 8_000);
  const output = resampleLinear(source, 8_000, 22_050);
  assert.equal(output.length, 22_050);
  assert.ok(Math.abs(output.at(-1) - source.at(-1)) < 0.001);
});

test('buildRenderTimeline garde chaque voix dans sa scène', () => {
  const scenes = [
    { id: 'a', duration: 2 },
    { id: 'b', duration: 3 },
    { id: 'c', duration: 2 }
  ];
  const voiceDurations = [1.2, 5.5, 0];
  const timeline = buildRenderTimeline(scenes, voiceDurations, { targetDuration: 7 });
  assert.equal(timeline.plan.length, 3);
  assert.equal(timeline.plan[0].start, 0);
  assert.ok(timeline.plan[1].duration >= voiceDurations[1]);
  assert.ok(timeline.plan[2].start >= timeline.plan[1].end);
  assert.equal(timeline.totalDuration, timeline.plan.at(-1).end);
});

test('musique et mix produisent un signal borné avec un vrai fade-out', () => {
  const duration = 2;
  const music = composeMusicBed('viral', duration, { sampleRate: AUDIO_SAMPLE_RATE });
  assert.equal(music.samples.length, duration * AUDIO_SAMPLE_RATE);
  assert.equal(music.bpm, 106);

  const firstTailWindow = music.samples.subarray(music.samples.length - AUDIO_SAMPLE_RATE, music.samples.length - AUDIO_SAMPLE_RATE + 1_000);
  const finalWindow = music.samples.subarray(music.samples.length - 1_000);
  const energy = values => values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
  assert.ok(energy(finalWindow) < energy(firstTailWindow));

  const voice = new Float32Array(music.samples.length);
  voice.fill(0.3, 1_000, 4_000);
  const mixed = mixVoiceAndMusic({
    voiceSamples: voice,
    musicSamples: music.samples,
    sampleRate: AUDIO_SAMPLE_RATE,
    durationSeconds: duration,
    voiceRanges: [{ start: 1_000 / AUDIO_SAMPLE_RATE, end: 4_000 / AUDIO_SAMPLE_RATE }]
  });
  assert.equal(mixed.length, music.samples.length);
  assert.ok([...mixed].every(value => Number.isFinite(value) && Math.abs(value) <= 1));
});
