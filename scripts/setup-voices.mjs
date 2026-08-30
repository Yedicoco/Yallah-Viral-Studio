#!/usr/bin/env node
// Installe un runtime TTS isolé et les voix neuronales recommandées.
// Usage : node scripts/setup-voices.mjs [--language fr|ar|all] [--runtime-only]

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const venv = join(root, '.venv');
const modelsDir = join(root, 'assets', 'models');
const requestedLanguage = (process.argv.find(arg => arg.startsWith('--language='))?.split('=')[1] || 'all').toLowerCase();
const runtimeOnly = process.argv.includes('--runtime-only');
const validLanguages = new Set(['fr', 'ar', 'all']);

if (!validLanguages.has(requestedLanguage)) {
  console.error('Langue invalide. Utilisez --language=fr, --language=ar ou --language=all.');
  process.exit(2);
}

// Tailles/empreintes du manifeste officiel rhasspy/piper-voices. L'auto-test
// de synthèse complète ce contrôle d'intégrité avant toute activation runtime.
const voices = {
  fr: {
    id: 'fr_FR-siwis-medium',
    sample: 'Bienvenue chez Yallah Services. Votre vidéo est prête.',
    model: { size: 63_201_294, sha256: '641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99' },
    config: { size: 4_875, md5: 'a407e7e6901feb79c2ea2a5466076cce' }
  },
  ar: {
    id: 'ar_JO-kareem-medium',
    sample: 'مرحبا بكم في يلاه سيرفيسز',
    model: { size: 63_201_294, sha256: '9e95cab07b679da603bba17c4dec7ab3111320571964ee95c0379603c086491e' },
    config: { size: 5_024, md5: 'dd70b31eb5a395907241b1e5367ace3a' }
  }
};

function executable(name) {
  return process.platform === 'win32'
    ? join(venv, 'Scripts', `${name}.exe`)
    : join(venv, 'bin', name);
}

function run(command, args, { optional = false, timeoutMs = 10 * 60 * 1_000 } = {}) {
  console.log(`\n› ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    timeout: timeoutMs,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });
  if (result.status !== 0 && !optional) {
    throw new Error(`Commande en échec (${result.status ?? result.error?.message}): ${command}`);
  }
  return result.status === 0;
}

function matchesManifest(path, expected) {
  if (!existsSync(path) || statSync(path).size !== expected.size) return false;
  const algorithm = expected.sha256 ? 'sha256' : 'md5';
  const digest = createHash(algorithm).update(readFileSync(path)).digest('hex');
  return digest === (expected.sha256 || expected.md5);
}

function modelComplete(voice) {
  const model = join(modelsDir, `${voice.id}.onnx`);
  const config = `${model}.json`;
  if (!matchesManifest(model, voice.model) || !matchesManifest(config, voice.config)) return false;
  try {
    const parsed = JSON.parse(readFileSync(config, 'utf8'));
    return Boolean(parsed.audio?.sample_rate && parsed.phoneme_id_map);
  } catch {
    return false;
  }
}

try {
  if (!existsSync(executable('python'))) {
    const basePython = process.env.YVS_BOOTSTRAP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    run(basePython, ['-m', 'venv', venv]);
  }

  const python = executable('python');
  run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', join(root, 'requirements-tts.txt')]);
  await mkdir(modelsDir, { recursive: true });

  if (!runtimeOnly) {
    const languages = requestedLanguage === 'all' ? ['fr', 'ar'] : [requestedLanguage];
    for (const language of languages) {
      const voice = voices[language];
      if (!modelComplete(voice)) {
        for (let attempt = 1; attempt <= 3 && !modelComplete(voice); attempt += 1) {
          await rm(join(modelsDir, `${voice.id}.onnx`), { force: true });
          await rm(join(modelsDir, `${voice.id}.onnx.json`), { force: true });
          console.log(`Téléchargement ${voice.id} — tentative ${attempt}/3`);
          run(python, ['-m', 'piper.download_voices', '--download-dir', modelsDir, voice.id], {
            optional: true,
            timeoutMs: 5 * 60 * 1_000
          });
          if (!modelComplete(voice) && attempt < 3) {
            console.warn('Téléchargement incomplet ou empreinte invalide ; nouvelle tentative…');
            await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 1_000));
          }
        }
      } else {
        console.log(`✓ ${voice.id} est déjà installé et son intégrité est vérifiée.`);
      }

      if (!modelComplete(voice)) {
        throw new Error(`Le modèle ${voice.id} est incomplet ou son empreinte est invalide après 3 tentatives.`);
      }

      const testFile = join(modelsDir, `.${voice.id}-self-test.wav`);
      const check = spawnSync(python, [
        '-m', 'piper',
        '-m', join(modelsDir, `${voice.id}.onnx`),
        '-c', join(modelsDir, `${voice.id}.onnx.json`),
        '-f', testFile
      ], { cwd: root, input: voice.sample, encoding: 'utf8', stdio: ['pipe', 'ignore', 'inherit'] });
      if (check.status !== 0 || !existsSync(testFile) || statSync(testFile).size < 1_000) {
        throw new Error(`L'auto-test de la voix ${voice.id} a échoué.`);
      }
      await rm(testFile, { force: true });
      console.log(`✓ ${voice.id} validé par une synthèse réelle.`);
    }
  }

  // Le fallback est testé séparément : un problème de modèle ne doit jamais bloquer le rendu.
  const fallbackFile = join(modelsDir, '.espeak-self-test.wav');
  run(python, [join(root, 'scripts', 'tts_espeak.py'), 'Test de secours Yallah', 'fr-fr', fallbackFile]);
  await rm(fallbackFile, { force: true });

  console.log('\n✅ Voix prêtes. Vérification : GET /api/voices');
  console.log('ℹ️  Piper : GPL-3.0-or-later. SIWIS : CC BY 4.0. Kareem : voir le MODEL_CARD du catalogue Piper.');
} catch (error) {
  console.error(`\n❌ ${error.message}`);
  console.error('Le rendu reste possible avec espeak si le runtime a été installé. Relancez la commande quand le réseau est disponible.');
  process.exit(1);
}
