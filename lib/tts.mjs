// Synthèse vocale serveur pour le rendu vidéo.
// Deux moteurs, par priorité :
//   1. Piper (voix neuronale open source) — si un modèle .onnx est présent
//      dans assets/models/ pour la langue. Téléchargement facultatif, voir
//      docs/generation-video-ia.md.
//   2. espeak-ng (embarqué via espeakng-loader, pip) — toujours disponible,
//      qualité robotique mais débit, timing et cohérence garantis, hors-ligne.
// Ajustement du timing : si la voix déborde du budget de sa scène, un
// `atempo` FFmpeg (préservation de la hauteur) resserre le débit, moteur
// de synthèse inchangé.
//
// API : synthesizeSceneVoice({ text, language, outFile, sceneBudgetSeconds })
//       → { file, durationSeconds, engine, voice }

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { decodeWavPcm16, resampleLinear, encodeWavPcm16, AUDIO_SAMPLE_RATE } from './audio.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = join(root, 'assets', 'models');
const ESPEAK_SCRIPT = join(root, 'scripts', 'tts_espeak.py');
const PYTHON = process.env.YVS_PYTHON || 'python3';
const FFMPEG = ffmpegInstaller.path;

// Modèles Piper cherchés par langue (le premier trouvé gagne).
// Les noms suivent le catalogue rhasspy/piper-voices.
const PIPER_MODELS = {
  fr: ['fr_FR-tom-medium.onnx', 'fr_FR-siwis-medium.onnx', 'fr_FR-upmc-medium.onnx'],
  darija: ['ar_JO-kareem-medium.onnx'],
  ar: ['ar_JO-kareem-medium.onnx']
};

const ESPEAK_VOICES = {
  fr: 'fr-fr',
  darija: 'ar', // darija transcrite en latin : la voix arabe donne l'accent marocain le plus proche
  ar: 'ar'
};

function canRead(path) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function listAvailableVoices() {
  const voices = [];
  for (const [language, models] of Object.entries(PIPER_MODELS)) {
    const found = models.find(model => canRead(join(MODELS_DIR, model)));
    if (found) voices.push({ language, engine: 'piper', model: found });
  }
  for (const language of ['fr', 'darija', 'ar']) {
    if (!voices.some(voice => voice.language === language)) {
      voices.push({ language, engine: 'espeak-ng', model: ESPEAK_VOICES[language] });
    }
  }
  return voices;
}

function runProcess(command, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Délai dépassé pour ${command}`));
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} a échoué (${code}) : ${stderr.slice(0, 400)}`));
    });
  });
}

async function synthesizeWithEspeak(text, language, outFile) {
  const voice = ESPEAK_VOICES[language] || 'fr-fr';
  const result = await runProcess(PYTHON, [ESPEAK_SCRIPT, text, voice, outFile]);
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration)) throw new Error('Durée de voix illisible');
  return { engine: 'espeak-ng', voice };
}

// Resserre le débit d'un WAV sans changer la hauteur (FFmpeg atempo).
async function tightenTempo(outFile, currentDuration, budgetSeconds) {
  if (!budgetSeconds || currentDuration <= budgetSeconds * 1.12) {
    return { durationSeconds: currentDuration, tempo: 1 };
  }
  const tempo = Math.min(1.45, currentDuration / (budgetSeconds * 0.98));
  const fastFile = outFile.replace(/\.wav$/, '.fast.wav');
  try {
    await runProcess(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', outFile,
      '-filter:a', `atempo=${tempo.toFixed(3)}`,
      '-ar', String(AUDIO_SAMPLE_RATE),
      fastFile
    ], { timeoutMs: 60_000 });
    await rename(fastFile, outFile);
    return { durationSeconds: Number((currentDuration / tempo).toFixed(3)), tempo: Number(tempo.toFixed(3)) };
  } catch {
    await rm(fastFile, { force: true });
    return { durationSeconds: currentDuration, tempo: 1 };
  }
}

// Synthétise la voix d'une scène et la cale sur son budget de temps.
export async function synthesizeSceneVoice({ text, language, outFile, sceneBudgetSeconds }) {
  await mkdir(dirname(outFile), { recursive: true });

  const models = PIPER_MODELS[language] || PIPER_MODELS.fr;
  const piperModel = models.find(model => canRead(join(MODELS_DIR, model)));

  let meta;
  if (piperModel) {
    meta = await synthesizeWithPiperStdin(text, piperModel, outFile);
  } else {
    meta = await synthesizeWithEspeak(text, language, outFile);
  }

  // normalisation : mono 22 kHz PCM16
  const raw = decodeWavPcm16(await readFile(outFile));
  const normalized = resampleLinear(raw.samples, raw.sampleRate, AUDIO_SAMPLE_RATE);
  await writeFile(outFile, encodeWavPcm16(normalized, AUDIO_SAMPLE_RATE));

  // calage tempo sur le budget de la scène
  const rawDuration = normalized.length / AUDIO_SAMPLE_RATE;
  const { durationSeconds, tempo } = await tightenTempo(outFile, rawDuration, sceneBudgetSeconds);

  return {
    file: outFile,
    durationSeconds,
    engine: meta.engine,
    voice: meta.voice,
    tempoApplied: tempo !== 1 ? tempo : undefined
  };
}

// Piper lit son texte sur l'entrée standard.
async function synthesizeWithPiperStdin(text, modelFile, outFile) {
  await new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['-m', 'piper', '-m', join(MODELS_DIR, modelFile), '-f', outFile], {
      stdio: ['pipe', 'ignore', 'pipe']
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Délai dépassé pour piper'));
    }, 180_000);
    child.stderr.on('data', () => {});
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`piper a échoué (${code})`));
    });
    child.stdin.end(text);
  });
  return { engine: 'piper', voice: modelFile.replace('.onnx', '') };
}
