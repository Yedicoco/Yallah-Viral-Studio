// Moteur de dessin partagé preview/rendu — isomorphe (navigateur + Node).
// Une seule source de vérité visuelle : la preview navigateur et les frames
// du MP4 serveur passent par drawStudioFrame(), donc elles sont identiques.
// Aucune dépendance Node : ce fichier est importable des deux côtés.

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Inter d'abord : le fallback vers Noto Sans Arabic fonctionne,
// l'inverse casse l'ordre bidi des chiffres.
const FONT_STACK = 'Inter, "Noto Sans Arabic", sans-serif';
const ARABIC_FONT_STACK = FONT_STACK;

const PALETTES = {
  viral: { a: '#ff9f1c', b: '#ff4d4f', c: '#1b1033', text: '#ffffff', accent: '#ffbe0b' },
  luxe: { a: '#c9a35f', b: '#5c4322', c: '#0e0b14', text: '#ffffff', accent: '#e9d8a6' },
  commercial: { a: '#20c997', b: '#0b7285', c: '#07121a', text: '#ffffff', accent: '#96f2d7' },
  emotion: { a: '#f06595', b: '#862e9c', c: '#170a1e', text: '#ffffff', accent: '#fcc2d7' },
  urgent: { a: '#ff4d4f', b: '#7f1d1d', c: '#160707', text: '#ffffff', accent: '#ffe066' },
  storytelling: { a: '#845ef7', b: '#3b5bdb', c: '#0b0614', text: '#ffffff', accent: '#d0bfff' }
};

export function hasArabic(text) {
  return ARABIC_RE.test(String(text || ''));
}

function paletteFor(project) {
  const code = project?.style?.code || project?.input?.style || 'viral';
  return PALETTES[code] || PALETTES.viral;
}

function font(weight, size, arabic = false) {
  const face = arabic ? ARABIC_FONT_STACK : FONT_STACK;
  return `${weight} ${size}px ${face}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth, maxLines = 5) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

// Découpe un texte en lignes compatibles bidi : les mots arabes et latins
// sont regroupés par direction, puis les groupes sont posés de droite à gauche
// quand la langue de base est RTL. Chaque groupe étant dessiné par un seul
// fillText, le modelage (shaping) reste correct à l'intérieur du groupe.
function wrapBidiLines(ctx, text, maxWidth, maxLines = 5, baseRTL = false) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = [];

  const fits = candidate => ctx.measureText(candidate).width <= maxWidth;

  for (const word of words) {
    const candidate = [...current, word].join(' ');
    if (fits(candidate) || current.length === 0) {
      current.push(word);
    } else {
      lines.push(current);
      current = [word];
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines.map(wordsOfLine => {
    // groupes consécutifs de même direction
    const runs = [];
    for (const word of wordsOfLine) {
      const rtlWord = hasArabic(word);
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.rtl === rtlWord) lastRun.words.push(word);
      else runs.push({ rtl: rtlWord, words: [word] });
    }
    return { runs, baseRTL };
  });
}

// Dessine une liste de lignes bidi, centrée sur centerX, alignée en haut sur startY.
// Utilise la baseline alphabétique + l'ascent réel mesuré : textBaseline='top'
// n'est pas fiable avec Noto Sans Arabic (métriques de police très grandes).
function drawBidiLines(ctx, bidiLines, centerX, startY, lineHeight) {
  const spaceWidth = ctx.measureText(' ').width;
  const previousBaseline = ctx.textBaseline;
  ctx.textBaseline = 'alphabetic';
  let y = startY;
  for (const line of bidiLines) {
    const metrics = line.runs.map(run => {
      const text = run.words.join(' ');
      const measured = ctx.measureText(text);
      return {
        text,
        width: measured.width,
        ascent: measured.actualBoundingBoxAscent || measured.fontBoundingBoxAscent || lineHeight * 0.8
      };
    });
    const totalWidth = metrics.reduce((sum, metric) => sum + metric.width, 0) + spaceWidth * Math.max(0, metrics.length - 1);
    const baselineY = y + Math.max(...metrics.map(metric => metric.ascent));
    let cursor = line.baseRTL ? centerX + totalWidth / 2 : centerX - totalWidth / 2;
    metrics.forEach((metric, runIndex) => {
      const drawX = line.baseRTL ? cursor - metric.width : cursor;
      ctx.fillText(metric.text, drawX + metric.width / 2, baselineY);
      cursor = line.baseRTL ? drawX - spaceWidth : drawX + metric.width + spaceWidth;
    });
    y += lineHeight;
  }
  ctx.textBaseline = previousBaseline;
  return y - startY;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Plan par défaut si aucun rendu serveur n'existe encore (preview navigateur).
export function fallbackTimeline(project) {
  const scenes = project?.script?.scenes || [];
  const plan = scenes.map((scene, index) => ({
    index,
    sceneId: scene.id,
    start: scene.startAt,
    end: scene.startAt + scene.duration,
    duration: scene.duration,
    voiceStart: scene.startAt
  }));
  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0) || 1;
  return { plan, totalDuration: total };
}

export function getTimelineEntry(timeline, elapsedSeconds) {
  const plan = timeline?.plan || [];
  return plan.find(entry => elapsedSeconds >= entry.start && elapsedSeconds < entry.end) || plan[plan.length - 1];
}

// Dessine la frame à elapsedSeconds. Retourne l'entrée de timeline utilisée.
function isNearDuplicate(a, b) {
  const norm = value => String(value || '').toLowerCase().replace(/[\p{P}\p{S}]+/gu, '').replace(/\s+/g, ' ').trim();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= right.length) return left.includes(right);
  return right.includes(left);
}

// Cercles concentriques translucides + trainées lumineuses, animés lentement.
function drawBackdropMotif(ctx, { width, height, elapsedSeconds, palette, sceneIndex }) {
  const cx = width * (0.5 + 0.18 * Math.sin(elapsedSeconds * 0.5 + sceneIndex * 1.7));
  const cy = height * (0.36 + 0.05 * Math.cos(elapsedSeconds * 0.42 + sceneIndex));
  const baseRadius = width * (0.30 + 0.02 * Math.sin(elapsedSeconds * 0.8));

  ctx.save();
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * (1 + ring * 0.38), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.10 - ring * 0.028})`;
    ctx.lineWidth = 26 - ring * 7;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();

  // trainée diagonale dans la couleur d'accent
  ctx.translate(width / 2, height * 0.3);
  ctx.rotate(-0.5 + Math.sin(elapsedSeconds * 0.3) * 0.06);
  const streak = ctx.createLinearGradient(-width * 0.7, 0, width * 0.7, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, hexToRgba(palette.accent, 0.16));
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-width * 0.7, -46, width * 1.4, 92);
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const value = String(hex || '#ffffff').replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16) || 255;
  const g = parseInt(full.slice(2, 4), 16) || 255;
  const b = parseInt(full.slice(4, 6), 16) || 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Petit combiné téléphonique vectoriel (remplace l'emoji 📲 absent des polices serveur).
function drawPhoneIcon(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#0b0e17';
  const w = size * 0.58;
  const radius = size * 0.16;
  roundRectPath(ctx, x, y, w, size, radius);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  // écouteur
  roundRectPath(ctx, x + w * 0.3, y + size * 0.1, w * 0.4, size * 0.06, size * 0.03);
  ctx.fill();
  // bouton home
  ctx.beginPath();
  ctx.arc(x + w / 2, y + size * 0.85, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStudioFrame(ctx, { project, timeline, elapsedSeconds, width, height, showWatermark = true }) {
  const palette = paletteFor(project);
  const entry = getTimelineEntry(timeline, elapsedSeconds) || { start: 0, duration: 1, index: 0 };
  const scenes = project?.script?.scenes || [];
  const scene = scenes[entry.index] || {};
  const local = Math.max(0, elapsedSeconds - entry.start);
  const progress = clamp01(local / Math.max(0.001, entry.duration));
  const globalProgress = clamp01(elapsedSeconds / Math.max(0.001, timeline?.totalDuration || 1));
  const arabic = hasArabic(scene.onScreenText) || project?.language?.code === 'ar';

  // ---- fond : dégradé animé + halo ----
  const drift = Math.sin((elapsedSeconds * 0.35) + entry.index) * 0.06;
  const gradient = ctx.createLinearGradient(0, 0, width * (0.9 + drift), height);
  gradient.addColorStop(0, palette.a);
  gradient.addColorStop(0.42, palette.b);
  gradient.addColorStop(1, palette.c);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const halo = ctx.createRadialGradient(width / 2, height * 0.42, 40, width / 2, height * 0.42, width * 0.85);
  halo.addColorStop(0, 'rgba(255,255,255,0.14)');
  halo.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  // ---- motif abstrait animé (remplace l'emoji : aucune police emoji côté serveur) ----
  drawBackdropMotif(ctx, { width, height, elapsedSeconds, palette, sceneIndex: entry.index });

  // ---- Ken Burns sur le bloc contenu ----
  const kb = entry.index % 2 === 0 ? 1.03 + progress * 0.05 : 1.08 - progress * 0.05;

  // ---- flash de coupe entre scènes ----
  if (entry.index > 0 && local < 0.12) {
    ctx.save();
    ctx.globalAlpha = (1 - local / 0.12) * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // ---- barre de progression ----
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, width, 10);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, width * globalProgress, 10);

  // ---- watermark ----
  if (showWatermark) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = font(800, 21, false);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText('YALLAH SERVICES', width / 2, 52);
    ctx.restore();
  }

  // ---- contenu principal avec pop-in ----
  const pop = easeOutBack(clamp01(local / 0.38));
  ctx.save();
  ctx.translate(width / 2, height * 0.46);
  ctx.scale(kb * (0.92 + 0.08 * pop), kb * (0.92 + 0.08 * pop));
  ctx.globalAlpha = clamp01(local / 0.25);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // badge de scène
  const role = String(scene.role || 'scène').toUpperCase();
  const badge = `SCÈNE ${entry.index + 1}/${timeline?.plan?.length || scenes.length} · ${role}`;
  ctx.font = font(800, 22, false);
  const badgeWidth = ctx.measureText(badge).width + 44;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRectPath(ctx, -badgeWidth / 2, -height * 0.30, badgeWidth, 46, 23);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(badge, 0, -height * 0.30 + 24);
  ctx.textBaseline = 'top';

  // texte à l'écran
  const onScreen = scene.onScreenText || scene.visual || '';
  const size = onScreen.length > 90 ? 44 : onScreen.length > 48 ? 54 : 62;
  ctx.font = font(800, size, arabic);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  const useBidi = hasArabic(onScreen);
  const laidOut = useBidi
    ? wrapBidiLines(ctx, onScreen, width * 0.82, 5, arabic)
    : wrapLines(ctx, onScreen, width * 0.82, 5).map(lineText => ({ runs: [{ rtl: false, words: lineText.split(' ') }], baseRTL: false }));
  const lineHeight = size * 1.22;
  const yStart = -height * 0.16;
  drawBidiLines(ctx, laidOut, 0, yStart, lineHeight);
  ctx.restore();

  // ---- sous-titre de la voix off ----
  // Sur la scène finale le CTA occupe déjà le bas ; et si le sous-titre
  // répète mot pour mot le texte à l'écran, il n'apporte rien.
  const subtitle = scene.caption || '';
  const isLastScene = entry.index === (timeline?.plan?.length || scenes.length) - 1;
  const duplicatesOnScreen = isNearDuplicate(subtitle, scene.onScreenText || scene.visual || '');
  if (subtitle && !isLastScene && !duplicatesOnScreen) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const boxWidth = width * 0.86;
    ctx.font = font(600, 30, hasArabic(subtitle));
    const subLines = wrapLines(ctx, subtitle, boxWidth - 48, 3);
    const boxHeight = subLines.length * 40 + 36 + (hasArabic(subtitle) ? 16 : 0);
    const boxY = height - boxHeight - 200;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.82)';
    roundRectPath(ctx, (width - boxWidth) / 2, boxY, boxWidth, boxHeight, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    const subBidi = hasArabic(subtitle)
      ? wrapBidiLines(ctx, subtitle, boxWidth - 48, 3, arabic)
      : subLines.map(lineText => ({ runs: [{ rtl: false, words: lineText.split(' ') }], baseRTL: false }));
    drawBidiLines(ctx, subBidi, width / 2, boxY + 18 + 20, 40);
    ctx.restore();
  }

  // ---- CTA final renforcé ----
  if (entry.index === (timeline?.plan?.length || scenes.length) - 1) {
    const contact = project?.contact || {};
    const gsm = contact.gsm || contact.whatsapp || '';
    const slide = easeOutCubic(clamp01((local - 0.15) / 0.5));
    ctx.save();
    ctx.translate(0, (1 - slide) * 60);
    ctx.globalAlpha = slide;
    ctx.textAlign = 'center';

    const ctaWidth = width * 0.88;
    const ctaY = height - 168;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRectPath(ctx, (width - ctaWidth) / 2, ctaY, ctaWidth, 84, 42);
    ctx.fill();

    ctx.fillStyle = '#0b0e17';
    ctx.font = font(800, 32, false);
    ctx.textBaseline = 'middle';
    const ctaLabel = `WhatsApp ${gsm}`;
    const labelWidth = ctx.measureText(ctaLabel).width;
    const iconSize = 34;
    const contentWidth = labelWidth + iconSize + 18;
    const contentX = width / 2 - contentWidth / 2;
    drawPhoneIcon(ctx, contentX, ctaY + 44 - iconSize / 2, iconSize);
    ctx.fillText(ctaLabel, contentX + iconSize + 18 + labelWidth / 2, ctaY + 44);

    const socials = [contact.tiktok?.handle, contact.instagram?.handle].filter(Boolean).join('  ·  ');
    if (socials) {
      ctx.font = font(600, 21, false);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ctx.fillText(socials, width / 2, ctaY - 24);
    }
    ctx.restore();
  }

  return entry;
}
