// Pipeline de rendu vidéo MP4 — le cœur qui « termine l'objectif final ».
//
// Étapes d'un job :
//   1. Voix off : une piste par scène via Piper (neuronal, si modèle présent)
//      ou espeak-ng (secours embarqué)                    → progression 0-30 %
//   2. Timeline : recalage des scènes sur les durées réelles de voix      → 30 %
//   3. Bande-son procédurale (style) + mix voix avec ducking              → 34 %
//   4. Frames : animation 720×1280 à 30 i/s via lib/frame-draw.mjs        → 34-86 %
//   5. Encodage FFmpeg H.264 + AAC (open source)                          → 86-99 %
//   6. Affiche JPG (frame du hook)                                        → 100 %
//
// Les fichiers finaux vivent dans le répertoire temporaire de l'OS et sont
// purgés au bout de 3 h. Aucune dépendance payante, aucun service distant.

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { createRequire } from 'node:module';

import {
  AUDIO_SAMPLE_RATE,
  buildRenderTimeline,
  composeMusicBed,
  decodeWavPcm16,
  encodeWavPcm16,
  mixVoiceAndMusic
} from './audio.mjs';
import { synthesizeSceneVoice, listAvailableVoices } from './tts.mjs';
import { drawStudioFrame } from './frame-draw.mjs';
import { renderPoster, posterFilename } from './posters.mjs';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const FFMPEG = ffmpegInstaller.path;
const FPS = 30;
const WIDTH = 720;
const HEIGHT = 1280;
const JOB_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_QUEUE = 4;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;

// ---------- polices (enregistrées une seule fois par processus) ----------
let fontsRegistered = false;

async function registerFonts() {
  if (fontsRegistered) return;
  const fontsDir = join(__dirname0(), 'assets', 'fonts');
  const registrations = [
    ['Inter-Regular.ttf', 'Inter'],
    ['Inter-SemiBold.ttf', 'Inter'],
    ['Inter-ExtraBold.ttf', 'Inter'],
    ['NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
    ['NotoSansArabic-Bold.ttf', 'Noto Sans Arabic']
  ];
  for (const [file, family] of registrations) {
    try {
      GlobalFonts.registerFromPath(join(fontsDir, file), family);
    } catch {
      // police absente : le rendu retombe sur la police par défaut
    }
  }
  fontsRegistered = true;
}

function __dirname0() {
  return new URL('..', import.meta.url).pathname;
}

// ---------- état des jobs ----------

const jobs = new Map();
let queue = [];
let activeJobId = null;

function snapshot(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: Number(job.progress.toFixed(3)),
    error: job.error || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    voiceEngine: job.voiceEngine || null,
    video: job.status === 'done'
      ? {
          url: `/api/video-file/${job.id}`,
          posterUrl: `/api/video-poster/${job.id}`,
          filename: job.filename,
          sizeBytes: job.sizeBytes,
          durationSeconds: job.durationSeconds
        }
      : null,
    project: job.project
  };
}

export function createVideoJob(project, { mode = 'scenario', voiceText = '' } = {}) {
  if (queue.length >= MAX_QUEUE) {
    throw Object.assign(new Error('File de rendu pleine, réessayez dans un instant'), { statusCode: 429 });
  }
  const id = `render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id,
    mode,
    voiceText: String(voiceText || '').trim(),
    project: JSON.parse(JSON.stringify(project)),
    status: 'queued',
    stage: 'En file d\u2019attente',
    progress: 0,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    workDir: null,
    filename: null,
    sizeBytes: 0,
    durationSeconds: 0,
    voiceEngine: null
  };
  jobs.set(id, job);
  queue.push(id);
  scheduleNext();
  return snapshot(job);
}

export function getVideoJob(id) {
  const job = jobs.get(id);
  return job ? snapshot(job) : null;
}

export function getVideoJobFilePath(id, kind) {
  const job = jobs.get(id);
  if (!job || job.status !== 'done') return null;
  if (kind === 'poster') return job.posterPath || null;
  return job.videoPath || null;
}

function setStage(job, stage, progress) {
  job.stage = stage;
  if (progress != null) job.progress = Math.max(0, Math.min(0.999, progress));
  console.log(`[render ${job.id}] ${Math.round(job.progress * 100)}% — ${stage}`);
}

function scheduleNext() {
  if (activeJobId || queue.length === 0) return;
  const id = queue.shift();
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') {
    scheduleNext();
    return;
  }
  activeJobId = id;
  runJob(job)
    .catch(error => {
      console.error(`[render ${id}] erreur :`, error);
      job.status = 'error';
      job.error = error.message || 'Erreur de rendu inconnue';
      job.finishedAt = Date.now();
    })
    .finally(() => {
      if (job.status === 'rendering') {
        job.status = 'done';
        job.progress = 1;
        job.finishedAt = Date.now();
      }
      activeJobId = null;
      cleanupOldJobs();
      scheduleNext();
    });
}

async function runJob(job) {
  job.status = 'rendering';
  job.startedAt = Date.now();
  const timeout = setTimeout(() => {
    job.status = 'error';
    job.error = 'Rendu trop long, abandonné après 10 minutes';
  }, RENDER_TIMEOUT_MS);

  try {
    await registerFonts();
    job.workDir = await mkdtemp(join(tmpdir(), 'yvs-render-'));
    if (job.mode === 'poster') {
      await runPosterJob(job);
      clearTimeout(timeout);
      return;
    }
    const project = job.project;
    const scenes = project?.script?.scenes || [];
    if (!scenes.length) throw new Error('Projet sans scène : impossible de rendre la vidéo');

    const styleCode = project?.style?.code || project?.input?.style || 'viral';
    const language = project?.language?.code || project?.input?.language || 'fr';
    const targetDuration = Number(project?.input?.duration) || project?.script?.targetDuration || 30;

    // ---------- 1. voix off par scène ----------
    const voiceClips = [];
    let engineSummary = new Set();
    const voicesAvailable = listVoicesSummary(language);
    setStage(job, `Voix off (${voicesAvailable})…`, 0.04);

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const text = scene.voice || scene.onScreenText || '';
      if (!text.trim()) {
        voiceClips.push(null);
        continue;
      }
      const outFile = join(job.workDir, `voice-${index}.wav`);
      const budget = Math.max(2, Number(scene.duration) || 4);
      const clip = await synthesizeSceneVoice({ text, language, outFile, sceneBudgetSeconds: budget });
      voiceClips.push(clip);
      engineSummary.add(clip.engine);
      setStage(job, `Voix off scène ${index + 1}/${scenes.length} (${[...engineSummary][0]})…`, 0.04 + (index + 1) / scenes.length * 0.24);
    }
    job.voiceEngine = [...engineSummary].join(' + ');

    // ---------- 2. timeline ----------
    setStage(job, 'Calage du montage sur la voix…', 0.3);
    const voiceDurations = voiceClips.map(clip => (clip ? clip.durationSeconds : 0));
    const timeline = buildRenderTimeline(scenes, voiceDurations, { targetDuration });
    const totalDuration = timeline.totalDuration;

    // ---------- 3. audio final ----------
    setStage(job, 'Bande-son et mixage…', 0.32);
    const voiceTrack = new Float32Array(Math.ceil((totalDuration + 0.5) * AUDIO_SAMPLE_RATE));
    const voiceRanges = [];

    for (let index = 0; index < voiceClips.length; index += 1) {
      const clip = voiceClips[index];
      if (!clip) continue;
      const buffer = await readFile(clip.file);
      const { samples } = decodeWavPcm16(buffer);
      const startSample = Math.floor(timeline.plan[index].voiceStart * AUDIO_SAMPLE_RATE);
      for (let i = 0; i < samples.length && startSample + i < voiceTrack.length; i += 1) {
        voiceTrack[startSample + i] += samples[i];
      }
      voiceRanges.push({ start: timeline.plan[index].voiceStart, end: timeline.plan[index].voiceStart + clip.durationSeconds });
    }

    const music = composeMusicBed(styleCode, totalDuration + 0.5, { sampleRate: AUDIO_SAMPLE_RATE });
    const mixed = mixVoiceAndMusic({
      voiceSamples: voiceTrack,
      sampleRate: AUDIO_SAMPLE_RATE,
      musicSamples: music.samples,
      durationSeconds: totalDuration,
      voiceRanges
    });

    const audioPath = join(job.workDir, 'audio-final.wav');
    await writeFile(audioPath, encodeWavPcm16(mixed, AUDIO_SAMPLE_RATE));

    // ---------- 4. frames ----------
    const framesDir = join(job.workDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const totalFrames = Math.max(1, Math.round(totalDuration * FPS));
    const rtl = language === 'ar';

    // fond photo pro du service (identité visuelle identique aux affiches)
    let backgroundImage = null;
    try {
      const bgPath = join(__dirname0(), 'assets', 'backgrounds', `${project?.input?.service || 'autre'}.jpg`);
      if (existsSync(bgPath)) {
        backgroundImage = await loadImage(bgPath);
      }
    } catch {
      backgroundImage = null;
    }

    for (let frame = 0; frame < totalFrames; frame += 1) {
      const elapsed = frame / FPS;
      drawStudioFrame(ctx, { project, timeline, elapsedSeconds: elapsed, width: WIDTH, height: HEIGHT, backgroundImage });
      const jpeg = await canvas.encode('jpeg', 88);
      await writeFile(join(framesDir, `frame_${String(frame).padStart(5, '0')}.jpg`), jpeg);
      if (frame % 45 === 0) {
        setStage(job, `Animation ${Math.round((frame / totalFrames) * 100)} %…`, 0.34 + (frame / totalFrames) * 0.5);
      }
    }

    // affiche = frame du hook
    drawStudioFrame(ctx, { project, timeline, elapsedSeconds: 0.7, width: WIDTH, height: HEIGHT, backgroundImage });
    const posterPath = join(job.workDir, 'poster.jpg');
    await writeFile(posterPath, await canvas.encode('jpeg', 90));
    job.posterPath = posterPath;

    // ---------- 5. encodage ffmpeg ----------
    setStage(job, 'Encodage H.264 + AAC…', 0.86);
    const videoPath = join(job.workDir, 'video.mp4');
    await runFfmpeg([
      '-y',
      '-framerate', String(FPS),
      '-i', join(framesDir, 'frame_%05d.jpg'),
      '-i', audioPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
      '-c:a', 'aac',
      '-b:a', '112k',
      '-ar', '44100',
      '-ac', '2',
      '-shortest',
      '-movflags', '+faststart',
      videoPath
    ], percent => {
      setStage(job, `Encodage H.264 + AAC… ${percent}%`, 0.86 + (percent / 100) * 0.13);
    });

    const videoStat = await stat(videoPath);
    job.videoPath = videoPath;
    job.sizeBytes = videoStat.size;
    job.durationSeconds = Number(totalDuration.toFixed(2));
    job.filename = slugFilename(project?.title || 'yallah-video') + '.mp4';

    // ---------- 6. métadonnées dans le projet ----------
    project.render = {
      engine: 'ffmpeg + @napi-rs/canvas + piper/espeak-ng (100 % open source)',
      resolution: `${WIDTH}x${HEIGHT}`,
      fps: FPS,
      plan: timeline.plan,
      totalDuration,
      stretched: timeline.stretched,
      voiceEngine: job.voiceEngine,
      voiceNote: voicesAvailable,
      musicBpm: music.bpm,
      languageDirection: rtl ? 'rtl' : 'ltr',
      renderedAt: new Date().toISOString()
    };

    // purge des frames intermédiaires (le mp4 reste disponible pour téléchargement)
    await rm(framesDir, { recursive: true, force: true });
    await rm(audioPath, { force: true });
    for (const clip of voiceClips) {
      if (clip?.file) await rm(clip.file, { force: true });
    }

    setStage(job, 'Terminé', 0.999);
    clearTimeout(timeout);
    job.status = 'done';
    job.progress = 1;
    job.finishedAt = Date.now();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Vidéo d'affiche : l'affiche professionnelle animée (Ken Burns lent) +
// la voix off personnalisée fournie en texte + la bande-son du style.
async function runPosterJob(job) {
  const project = job.project;
  const styleCode = project?.style?.code || project?.input?.style || 'viral';

  // 1. voix : le texte fourni par l'utilisateur (sinon la voix off du script)
  const voiceText = job.voiceText || project?.script?.voiceOver || '';
  if (!voiceText) throw new Error('Aucun texte de voix off fourni');
  const language = project?.language?.code || project?.input?.language || 'fr';
  setStage(job, 'Synthèse de la voix off…', 0.06);
  const clip = await synthesizeSceneVoice({
    text: voiceText,
    language,
    outFile: join(job.workDir, 'poster-voice.wav'),
    sceneBudgetSeconds: null
  });
  job.voiceEngine = clip.engine;

  // 2. durée : voix + respiration, bornée
  const totalDuration = Math.min(90, Math.max(8, clip.durationSeconds + 1.4));
  const timeline = { plan: [{ index: 0, start: 0, end: totalDuration, duration: totalDuration, voiceStart: 0.5 }], totalDuration };

  // 3. audio : voix + musique discrète
  setStage(job, 'Bande-son…', 0.2);
  const voiceSamples = decodeWavPcm16(await readFile(clip.file)).samples;
  const voiceTrack = new Float32Array(Math.ceil((totalDuration + 0.5) * AUDIO_SAMPLE_RATE));
  voiceTrack.set(voiceSamples.subarray(0, Math.min(voiceSamples.length, voiceTrack.length)), Math.floor(0.5 * AUDIO_SAMPLE_RATE));
  const music = composeMusicBed(styleCode, totalDuration + 0.5, { sampleRate: AUDIO_SAMPLE_RATE });
  const mixed = mixVoiceAndMusic({
    voiceSamples: voiceTrack,
    sampleRate: AUDIO_SAMPLE_RATE,
    musicSamples: music.samples,
    durationSeconds: totalDuration,
    voiceRanges: [{ start: 0.5, end: 0.5 + clip.durationSeconds }],
    musicBase: 0.26,
    musicUnderVoice: 0.13
  });
  const audioPath = join(job.workDir, 'audio-final.wav');
  await writeFile(audioPath, encodeWavPcm16(mixed, AUDIO_SAMPLE_RATE));

  // 4. affiche haute définition puis animation Ken Burns 720×1280
  setStage(job, 'Composition de l\u2019affiche…', 0.3);
  const posterCanvas = await renderPoster(project, { format: 'story' });
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const totalFrames = Math.round(totalDuration * FPS);
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const progress = frame / totalFrames;
    const zoom = 1.02 + progress * 0.06;
    const drift = Math.sin(progress * Math.PI) * 10;
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const drawW = WIDTH * zoom;
    const drawH = HEIGHT * zoom;
    ctx.drawImage(posterCanvas, (WIDTH - drawW) / 2, (HEIGHT - drawH) / 2 + drift, drawW, drawH);
    await writeFile(join(job.workDir, `frame_${String(frame).padStart(5, '0')}.jpg`), await canvas.encode('jpeg', 88));
    if (frame % 45 === 0) setStage(job, `Animation ${Math.round((frame / totalFrames) * 100)} %…`, 0.3 + (frame / totalFrames) * 0.55);
  }

  // 5. encodage
  setStage(job, 'Encodage H.264 + AAC…', 0.88);
  const videoPath = join(job.workDir, 'video.mp4');
  await runFfmpeg([
    '-y',
    '-framerate', String(FPS),
    '-i', join(job.workDir, 'frame_%05d.jpg'),
    '-i', audioPath,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '112k', '-ar', '44100', '-ac', '2',
    '-shortest', '-movflags', '+faststart',
    videoPath
  ], percent => setStage(job, `Encodage H.264 + AAC… ${percent}%`, 0.88 + (percent / 100) * 0.11));

  // 6. affiche PNG livrée avec la vidéo
  const posterPath = join(job.workDir, 'poster.jpg');
  await writeFile(posterPath, await posterCanvas.encode('jpeg', 90));
  job.posterPath = posterPath;

  const videoStat = await stat(videoPath);
  job.videoPath = videoPath;
  job.sizeBytes = videoStat.size;
  job.durationSeconds = Number(totalDuration.toFixed(2));
  job.filename = posterFilename(project, 'video');
  project.render = {
    ...(project.render || {}),
    mode: 'poster',
    voiceText,
    engine: 'affiche animée + TTS + FFmpeg (open source)',
    resolution: `${WIDTH}x${HEIGHT}`,
    fps: FPS,
    totalDuration,
    voiceEngine: job.voiceEngine,
    renderedAt: new Date().toISOString()
  };
  await rm(join(job.workDir, 'frames'), { recursive: true, force: true }).catch(() => {});
  await rm(audioPath, { force: true }).catch(() => {});
  await rm(clip.file, { force: true }).catch(() => {});
  setStage(job, 'Terminé', 0.999);
  job.status = 'done';
  job.progress = 1;
  job.finishedAt = Date.now();
}

function runFfmpeg(args, onPercent) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/time=(\d+):(\d+):(\d+)/g);
      if (match && onPercent) {
        const last = match[match.length - 1];
        const [, h, m, s] = last.match(/time=(\d+):(\d+):(\d+)/);
        const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
        onPercent(Math.min(99, Math.round(seconds * 100)));
      }
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Encodage FFmpeg trop long'));
    }, 8 * 60 * 1000);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg a échoué (${code}) : ${stderr.slice(-400)}`));
    });
  });
}

function slugFilename(title) {
  return String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'yallah-video';
}

function listVoicesSummary(language) {
  const voices = listAvailableVoices().filter(voice => voice.language === language);
  return voices.map(voice => voice.engine).join(' + ') || 'espeak-ng';
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      if (job.workDir) {
        rm(job.workDir, { recursive: true, force: true }).catch(() => {});
      }
      jobs.delete(id);
      queue = queue.filter(queuedId => queuedId !== id);
    }
  }
}
