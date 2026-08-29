// Moteur audio de Yallah Viral Studio — 100 % JavaScript, zéro dépendance.
// Rôle :
//   1. Lire/écrire des WAV PCM 16 bits
//   2. Placer les segments de voix off sur la timeline des scènes
//   3. Composer une bande-son procédurale (kick, basse, nappes) selon le style
//   4. Mixer voix + musique avec ducking, et sortir la piste finale
// La musique est une maquette sonore générée : le brief musical du projet
// reste la référence pour une vraie production musicale.

export const AUDIO_SAMPLE_RATE = 22050;

// ---------- WAV ----------

export function encodeWavPcm16(float32, sampleRate = AUDIO_SAMPLE_RATE) {
  const buffer = Buffer.alloc(44 + float32.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + float32.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(float32.length * 2, 40);
  for (let i = 0; i < float32.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

// Parseur WAV minimal : cherche le chunk « fmt » et le chunk « data ».
export function decodeWavPcm16(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Fichier WAV invalide');
  }
  let offset = 12;
  let sampleRate = AUDIO_SAMPLE_RATE;
  let channels = 1;
  let bitsPerSample = 16;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === 'data') {
      data = buffer.subarray(chunkStart, Math.min(buffer.length, chunkStart + chunkSize));
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!data) throw new Error('Chunk data absent du WAV');

  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(data.length / (bytesPerSample * channels));
  const mono = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const base = frame * bytesPerSample * channels + channel * bytesPerSample;
      const value = bytesPerSample === 2 ? data.readInt16LE(base) : (data.readUInt8(base) - 128) / 128;
      sum += value;
    }
    mono[frame] = sum / channels;
  }

  return { samples: mono, sampleRate };
}

export function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = toRate / fromRate;
  const outLength = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i / ratio;
    const left = Math.floor(srcPos);
    const right = Math.min(samples.length - 1, left + 1);
    const frac = srcPos - left;
    out[i] = samples[left] * (1 - frac) + samples[right] * frac;
  }
  return out;
}

// ---------- Timeline ----------

// Construit le plan de montage réel à partir des durées de voix mesurées.
// Chaque scène dure au minimum sa durée template, mais s'allonge si la voix
// off a besoin de plus de place (+ marges d'entrée/sortie).
export function buildRenderTimeline(scenes, voiceDurations, { targetDuration, gap = 0.32, maxStretch = 1.4 } = {}) {
  const raw = scenes.map((scene, index) => {
    const voice = voiceDurations[index] || 0;
    const template = Math.max(2, Number(scene.duration) || 4);
    const minimum = template * 0.92;
    return Math.max(minimum, voice + gap * 2, template);
  });

  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const limit = (targetDuration || rawTotal) * maxStretch;
  const scale = rawTotal > limit ? limit / rawTotal : 1;

  let cursor = 0;
  const plan = raw.map((duration, index) => {
    // après compression, garantir que la voix reste dans sa scène
    const voiceFloor = voiceDurations[index] ? voiceDurations[index] + gap * 1.2 : 0;
    const scaled = Math.max(1.6, duration * scale, voiceFloor);
    const entry = {
      index,
      sceneId: scenes[index].id,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + scaled).toFixed(3)),
      duration: Number(scaled.toFixed(3)),
      voiceStart: Number((cursor + gap * 0.6).toFixed(3))
    };
    cursor += scaled;
    return entry;
  });

  return { plan, totalDuration: Number(cursor.toFixed(3)), stretched: scale < 1 };
}

// ---------- Musique procédurale ----------

const NOTE_FREQS = buildNoteFrequencies();

function buildNoteFrequencies() {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const map = {};
  for (let octave = 1; octave <= 6; octave += 1) {
    for (let index = 0; index < names.length; index += 1) {
      map[`${names[index]}${octave}`] = 440 * Math.pow(2, (index - 9) / 12 + (octave - 4));
    }
  }
  return map;
}

const STYLE_MUSIC = {
  viral: { bpm: 106, waveform: 'pluck', bassPattern: [0, 0.5, 1.5, 2, 2.5, 3.5], kick: 'four', bright: 0.9 },
  urgent: { bpm: 118, waveform: 'pluck', bassPattern: [0, 0.75, 1.5, 2, 2.75, 3.5], kick: 'four', bright: 1 },
  luxe: { bpm: 88, waveform: 'pad', bassPattern: [0, 2], kick: 'half', bright: 0.6 },
  commercial: { bpm: 96, waveform: 'pluck', bassPattern: [0, 1, 2, 3], kick: 'four', bright: 0.75 },
  emotion: { bpm: 82, waveform: 'pad', bassPattern: [0, 2.5], kick: 'half', bright: 0.5 },
  storytelling: { bpm: 90, waveform: 'pad', bassPattern: [0, 1.5, 3], kick: 'half', bright: 0.65 }
};

// Progression de 4 mesures (Am – F – C – G transposée), bouclée sur la durée.
const CHORDS = [
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
  ['C4', 'E4', 'G4'],
  ['G3', 'B3', 'D4']
];

function midiFreq(name) {
  return NOTE_FREQS[name] || 220;
}

function addTone(mix, sampleRate, startSample, duration, freq, { gain = 0.2, attack = 0.012, release = 0.08, harmonics = [1], waveform = 'sine' } = {}) {
  const total = mix.length;
  const length = Math.min(total - startSample, Math.round(duration * sampleRate));
  if (length <= 0) return;
  const attackSamples = Math.max(1, attack * sampleRate);
  const releaseSamples = Math.max(1, release * sampleRate);

  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freq * t;
    let sample = 0;
    for (const harmonic of harmonics) {
      const h = 2 * Math.PI * freq * harmonic * t;
      if (waveform === 'pluck') {
        // saw adouci : somme de sine décroissantes
        sample += (Math.sin(h) + Math.sin(h * 2) * 0.35 + Math.sin(h * 3) * 0.15) / 1.5;
      } else if (waveform === 'pad') {
        sample += Math.sin(h) * 0.8 + Math.sin(h * 2.001) * 0.2;
      } else {
        sample += Math.sin(h);
      }
    }
    sample /= harmonics.length;

    let envelope = 1;
    if (i < attackSamples) envelope = i / attackSamples;
    const remaining = length - i;
    if (remaining < releaseSamples) envelope *= remaining / releaseSamples;
    // déclin exponentiel doux (percu/basse)
    envelope *= Math.exp(-t * 1.1);

    mix[startSample + i] += sample * gain * envelope;
  }
}

function addKick(mix, sampleRate, startSample, strength = 1) {
  const duration = 0.22;
  const length = Math.min(mix.length - startSample, Math.round(duration * sampleRate));
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const freq = 45 + 105 * Math.exp(-t * 26);
    const envelope = Math.exp(-t * 13);
    mix[startSample + i] += Math.sin(2 * Math.PI * freq * t) * 0.5 * envelope * strength;
  }
}

function addHat(mix, sampleRate, startSample, strength = 1) {
  const duration = 0.06;
  const length = Math.min(mix.length - startSample, Math.round(duration * sampleRate));
  let previous = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const noise = Math.random() * 2 - 1;
    const highpassed = noise - previous * 0.85; // filtre passe-haut grossier
    previous = noise;
    mix[startSample + i] += highpassed * 0.09 * strength * Math.exp(-t * 60);
  }
}

// Génère la maquette musicale complète (Float32 mono) pour la durée demandée.
export function composeMusicBed(styleCode, durationSeconds, { sampleRate = AUDIO_SAMPLE_RATE } = {}) {
  const conf = STYLE_MUSIC[styleCode] || STYLE_MUSIC.viral;
  const beat = 60 / conf.bpm;
  const bar = beat * 4;
  const totalSamples = Math.ceil(durationSeconds * sampleRate);
  const mix = new Float32Array(totalSamples);

  const barCount = Math.ceil(durationSeconds / bar) + 1;
  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const barStart = barIndex * bar;
    const chord = CHORDS[barIndex % CHORDS.length];

    // nappe d'accord
    for (const note of chord) {
      addTone(mix, sampleRate, Math.round(barStart * sampleRate), bar * 0.98,
        midiFreq(note) / 2, { gain: 0.05 * conf.bright + 0.02, attack: 0.25, release: 0.6, waveform: conf.waveform === 'pad' ? 'pad' : 'pluck', harmonics: [1, 1.005] });
    }

    // kick
    if (conf.kick === 'four') {
      for (let b = 0; b < 4; b += 1) addKick(mix, sampleRate, Math.round((barStart + b * beat) * sampleRate), 0.9);
    } else {
      addKick(mix, sampleRate, Math.round(barStart * sampleRate), 0.7);
      addKick(mix, sampleRate, Math.round((barStart + 2 * beat) * sampleRate), 0.55);
    }

    // hats off-beat
    for (let b = 0; b < 4; b += 1) {
      addHat(mix, sampleRate, Math.round((barStart + (b + 0.5) * beat) * sampleRate), conf.bright);
    }

    // basse
    const root = midiFreq(chord[0]) / 2;
    for (const offset of conf.bassPattern) {
      addTone(mix, sampleRate, Math.round((barStart + offset * beat) * sampleRate), beat * 0.7,
        root / 2, { gain: 0.16, attack: 0.006, release: 0.05, waveform: 'pluck' });
    }
  }

  // fade out global sur la dernière seconde
  const fadeSamples = Math.min(totalSamples, Math.round(1.0 * sampleRate));
  for (let i = 0; i < fadeSamples; i += 1) {
    mix[totalSamples - fadeSamples + i] *= i / fadeSamples;
  }

  // normalisation douce vers -6 dBFS crête
  let peak = 0;
  for (const value of mix) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) {
    const target = 0.5;
    const factor = target / peak;
    for (let i = 0; i < totalSamples; i += 1) mix[i] *= factor;
  }

  return { samples: mix, sampleRate, bpm: conf.bpm };
}

// ---------- Mix final ----------

// Mixe voix (plein) + musique (duckée pendant la parole, relevée en outro).
export function mixVoiceAndMusic({ voiceSamples, sampleRate, musicSamples, durationSeconds, voiceRanges = [], musicBase = 0.34, musicUnderVoice = 0.16, outroSeconds = 1.4 }) {
  const totalSamples = Math.ceil(durationSeconds * sampleRate);
  const out = new Float32Array(totalSamples);

  for (let i = 0; i < Math.min(voiceSamples.length, totalSamples); i += 1) {
    out[i] += voiceSamples[i];
  }

  // courbe de gain musique lissée
  const inVoice = new Uint8Array(totalSamples);
  for (const range of voiceRanges) {
    const from = Math.max(0, Math.floor(range.start * sampleRate));
    const to = Math.min(totalSamples, Math.ceil(range.end * sampleRate));
    for (let i = from; i < to; i += 1) inVoice[i] = 1;
  }

  const smoothing = Math.round(0.18 * sampleRate);
  let gain = musicBase;
  for (let i = 0; i < totalSamples; i += 1) {
    const target = inVoice[i] ? musicUnderVoice : musicBase;
    const step = (target - gain) / smoothing;
    gain += step;
    out[i] += musicSamples[i] * gain;
  }

  // outro : la musique reprend de la place sur les derniers instants, déjà couvert
  // par musicBase après la voix + fade géré dans composeMusicBed.

  // limiteur souple
  for (let i = 0; i < totalSamples; i += 1) {
    const value = Math.tanh(out[i] * 1.15) * 0.92;
    out[i] = value;
  }

  return out;
}
