// Synthèse vocale serveur pour le rendu vidéo.
// Priorité : Piper neuronal (installé par `npm run setup:voices`), puis
// espeak-ng comme repli fiable. Un modèle Piper incomplet ou défectueux ne
// fait plus échouer un rendu : le moteur retombe explicitement sur espeak.

import { spawn, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { decodeWavPcm16, resampleLinear, encodeWavPcm16, AUDIO_SAMPLE_RATE } from './audio.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = process.env.YVS_MODELS_DIR || join(root, 'assets', 'models');
const ESPEAK_SCRIPT = join(root, 'scripts', 'tts_espeak.py');
const FFMPEG = ffmpegInstaller.path;
const MAX_TTS_CHARACTERS = 5_000;

function defaultPython() {
  const candidates = process.platform === 'win32'
    ? [join(root, '.venv', 'Scripts', 'python.exe'), 'python']
    : [join(root, '.venv', 'bin', 'python'), 'python3'];
  return candidates.find(candidate => /[/\\]/.test(candidate) ? existsSync(candidate) : true);
}

const PYTHON = process.env.YVS_PYTHON || defaultPython();

// SIWIS est privilégiée en français pour sa prosodie régulière. Chaque modèle
// n'est utilisable que si son fichier de configuration adjacent est présent.
const PIPER_MODELS = {
  fr: ['fr_FR-siwis-medium.onnx', 'fr_FR-tom-medium.onnx', 'fr_FR-upmc-medium.onnx'],
  darija: ['ar_JO-kareem-medium.onnx'],
  ar: ['ar_JO-kareem-medium.onnx']
};

const ESPEAK_VOICES = {
  fr: 'fr-fr',
  darija: 'ar',
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

function modelIsComplete(model) {
  return canRead(join(MODELS_DIR, model)) && canRead(join(MODELS_DIR, `${model}.json`));
}

let runtimeCache = null;
function runtimeCapabilities() {
  if (runtimeCache) return runtimeCache;
  const check = moduleName => {
    const result = spawnSync(PYTHON, ['-c', `import ${moduleName}`], {
      stdio: 'ignore',
      timeout: 10_000
    });
    return !result.error && result.status === 0;
  };
  runtimeCache = {
    python: PYTHON,
    piper: check('piper'),
    espeak: check('espeakng_loader') && canRead(ESPEAK_SCRIPT)
  };
  return runtimeCache;
}

function configuredEngine() {
  const value = String(process.env.YVS_TTS_ENGINE || 'auto').toLowerCase();
  return ['auto', 'piper', 'espeak'].includes(value) ? value : 'auto';
}

export function listAvailableVoices() {
  const runtime = runtimeCapabilities();
  const requestedEngine = configuredEngine();
  return ['fr', 'darija', 'ar'].map(language => {
    const model = (PIPER_MODELS[language] || []).find(modelIsComplete);
    if (requestedEngine !== 'espeak' && model && runtime.piper) {
      return {
        language,
        engine: 'piper',
        model,
        quality: 'neural',
        ready: true,
        recommended: true
      };
    }
    if (requestedEngine !== 'piper' && runtime.espeak) {
      return {
        language,
        engine: 'espeak-ng',
        model: ESPEAK_VOICES[language],
        quality: 'fallback',
        ready: true,
        recommended: false,
        setupCommand: 'npm run setup:voices'
      };
    }
    return {
      language,
      engine: 'unavailable',
      model: null,
      quality: 'unavailable',
      ready: false,
      recommended: false,
      setupCommand: 'npm run setup:voices'
    };
  });
}

export function getVoiceDiagnostics() {
  const voices = listAvailableVoices();
  return {
    python: runtimeCapabilities().python,
    modelsDirectory: MODELS_DIR,
    neuralReady: voices.every(voice => voice.engine === 'piper'),
    renderReady: voices.every(voice => voice.ready),
    voices
  };
}

function runProcess(command, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject)(new Error(`Délai dépassé pour ${command}`));
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', finish(reject));
    child.on('close', code => {
      if (settled) return;
      if (code === 0) finish(resolveProcess)({ stdout, stderr });
      else finish(reject)(new Error(`${command} a échoué (${code}) : ${stderr.slice(0, 400)}`));
    });
  });
}

async function synthesizeWithEspeak(text, language, outFile) {
  if (!runtimeCapabilities().espeak) {
    throw new Error('Moteur vocal indisponible. Exécutez `npm run setup:voices`.');
  }
  const voice = ESPEAK_VOICES[language] || 'fr-fr';
  const result = await runProcess(PYTHON, [ESPEAK_SCRIPT, text, voice, outFile]);
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration)) throw new Error('Durée de voix illisible');
  return { engine: 'espeak-ng', voice };
}

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

export async function synthesizeSceneVoice({ text, language, outFile, sceneBudgetSeconds }) {
  const safeText = String(text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim();
  if (!safeText) throw new Error('Le texte de voix off est vide.');
  if (safeText.length > MAX_TTS_CHARACTERS) {
    throw new Error(`Le texte de voix off dépasse ${MAX_TTS_CHARACTERS} caractères.`);
  }
  await mkdir(dirname(outFile), { recursive: true });

  const models = PIPER_MODELS[language] || PIPER_MODELS.fr;
  const piperModel = models.find(modelIsComplete);
  const requestedEngine = configuredEngine();
  let meta;
  let fallbackReason;

  if (requestedEngine !== 'espeak' && piperModel && runtimeCapabilities().piper) {
    try {
      meta = await synthesizeWithPiperStdin(safeText, piperModel, outFile);
    } catch (error) {
      if (requestedEngine === 'piper') throw error;
      fallbackReason = `Piper indisponible pendant la synthèse : ${error.message}`;
      await rm(outFile, { force: true });
      meta = await synthesizeWithEspeak(safeText, language, outFile);
    }
  } else if (requestedEngine === 'piper') {
    throw new Error(`Voix Piper ${language} absente ou incomplète. Exécutez \`npm run setup:voices\`.`);
  } else {
    meta = await synthesizeWithEspeak(safeText, language, outFile);
  }

  let raw;
  try {
    raw = decodeWavPcm16(await readFile(outFile));
  } catch (error) {
    if (meta.engine !== 'piper' || requestedEngine === 'piper') throw error;
    fallbackReason = `Sortie Piper invalide : ${error.message}`;
    await rm(outFile, { force: true });
    meta = await synthesizeWithEspeak(safeText, language, outFile);
    raw = decodeWavPcm16(await readFile(outFile));
  }
  const normalized = resampleLinear(raw.samples, raw.sampleRate, AUDIO_SAMPLE_RATE);
  await writeFile(outFile, encodeWavPcm16(normalized, AUDIO_SAMPLE_RATE));

  const rawDuration = normalized.length / AUDIO_SAMPLE_RATE;
  const { durationSeconds, tempo } = await tightenTempo(outFile, rawDuration, sceneBudgetSeconds);

  return {
    file: outFile,
    durationSeconds,
    engine: meta.engine,
    voice: meta.voice,
    tempoApplied: tempo !== 1 ? tempo : undefined,
    fallbackReason
  };
}

async function synthesizeWithPiperStdin(text, modelFile, outFile) {
  await new Promise((resolveSynthesis, reject) => {
    const child = spawn(PYTHON, [
      '-m', 'piper',
      '-m', join(MODELS_DIR, modelFile),
      '-c', join(MODELS_DIR, `${modelFile}.json`),
      '-f', outFile
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject)(new Error('Délai dépassé pour Piper'));
    }, 180_000);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', finish(reject));
    child.on('close', code => {
      if (settled) return;
      if (code === 0) finish(resolveSynthesis)();
      else finish(reject)(new Error(`Piper a échoué (${code}) : ${stderr.slice(-300)}`));
    });
    child.stdin.end(text);
  });
  return { engine: 'piper', voice: modelFile.replace('.onnx', '') };
}
