// Moteur d'affiches professionnelles — PNG haute définition.
//
// Deux formats :
//   story  → 1080×1920 (statut WhatsApp, story Insta/Facebook, impression A4+
//             après recadrage, affichage TV)
//   square → 1080×1080 (post Instagram/Facebook/LinkedIn)
//
// Composition (les mêmes codes que la vidéo, donc une marque cohérente) :
//   photo de fond par service (assets/backgrounds/{service}.jpg) + voiles
//   de lisibilité, marque Yallah Services, badge service · ville, titre
//   (hook du projet), 3 arguments, carte contact WhatsApp blanche, réseaux.
// Textes FR / darija / arabe avec rendu bidi correct.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { registerStudioFonts, studioRoot } from './fonts.mjs';
import {
  hasArabic,
  wrapBidiLines,
  drawBidiLines,
  wrapLines,
  roundRectPath
} from './frame-draw.mjs';

const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const FORMATS = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 }
};

const FONT = 'Inter, "Noto Sans Arabic", sans-serif';

const PALETTE_BY_STYLE = {
  viral: '#ffbe0b',
  luxe: '#e9d8a6',
  commercial: '#96f2d7',
  emotion: '#fcc2d7',
  urgent: '#ffe066',
  storytelling: '#d0bfff'
};

function visualEffectsFor(project) {
  return [
    ...(Array.isArray(project?.input?.effects) ? project.input.effects : []),
    project?.input?.creativeDirection || '',
    ...(Array.isArray(project?.automatic?.effects) ? project.automatic.effects : [])
  ].join(' ').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Charte de marque centralisée (assets/brand.json) — source unique de cohérence
// avec les publications existantes. Modifier ce fichier aligne tout le studio.
let BRAND = null;
function brand() {
  if (BRAND) return BRAND;
  try {
    BRAND = JSON.parse(readFileSync(join(studioRoot(), 'assets', 'brand.json'), 'utf8'));
  } catch {
    BRAND = {};
  }
  return BRAND;
}

function brandName() {
  return brand().brandName || 'YALLAH SERVICES';
}

function brandTagline() {
  return brand().tagline || 'Yallah Services — mise en relation de confiance';
}

function backgroundPathFor(project) {
  const service = project?.input?.service || 'autre';
  const path = join(studioRoot(), 'assets', 'backgrounds', `${service}.jpg`);
  return existsSync(path) ? path : join(studioRoot(), 'assets', 'backgrounds', 'autre.jpg');
}

function serviceLabel(project) {
  // Le titre du projet est « {emoji} {service} · {ville} » — on retire emoji et ville.
  const parts = String(project?.title || '').split('·');
  return parts[0].replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u2B00-\u2BFF\uFE0F]/gu, '').trim() || 'Service';
}

function benefitsFrom(project, max = 3) {
  const scenes = project?.script?.scenes || [];
  const benefits = [];
  for (const scene of scenes.slice(1)) {
    const text = String(scene?.onScreenText || '').trim();
    if (!text) continue;
    if (benefits.some(existing => existing.toLowerCase() === text.toLowerCase())) continue;
    // majuscule initiale pour un rendu « affiche » propre
    const polished = text.charAt(0).toUpperCase() + text.slice(1);
    benefits.push(polished.length > 74 ? `${polished.slice(0, 71)}…` : polished);
    if (benefits.length === max) break;
  }
  return benefits;
}

function drawCheck(ctx, x, centerY, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, centerY + size * 0.05);
  ctx.lineTo(x + size * 0.32, centerY + size * 0.36);
  ctx.lineTo(x + size * 0.95, centerY - size * 0.38);
  ctx.stroke();
  ctx.restore();
}

function drawPhoneIcon(ctx, x, centerY, size) {
  ctx.save();
  ctx.fillStyle = '#0b0e17';
  const w = size * 0.56;
  const h = size;
  roundRectPath(ctx, x, centerY - h / 2, w, h, size * 0.14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRectPath(ctx, x + w * 0.3, centerY - h * 0.38, w * 0.4, size * 0.05, size * 0.02);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + w / 2, centerY + h * 0.34, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Voiles de lisibilité sur la photo (haut pour la marque, bas pour le contenu).
function drawScrims(ctx, width, height, { top = 0.2, bottom = 0.46 } = {}) {
  const topScrim = ctx.createLinearGradient(0, 0, 0, height * (top + 0.12));
  topScrim.addColorStop(0, 'rgba(7, 10, 18, 0.88)');
  topScrim.addColorStop(1, 'rgba(7, 10, 18, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, height * (top + 0.12));

  const bottomStart = height * (1 - bottom);
  const bottomScrim = ctx.createLinearGradient(0, bottomStart, 0, height);
  bottomScrim.addColorStop(0, 'rgba(7, 10, 18, 0)');
  bottomScrim.addColorStop(0.4, 'rgba(7, 10, 18, 0.72)');
  bottomScrim.addColorStop(1, 'rgba(7, 10, 18, 0.96)');
  ctx.fillStyle = bottomScrim;
  ctx.fillRect(0, bottomStart, width, height * bottom);
}

function drawBrand(ctx, width, y, accent, centerX = width / 2) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.round(46)}px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.fillText(brandName(), centerX, y);
  ctx.shadowBlur = 0;
  roundRectPath(ctx, centerX - 90, y + 18, 180, 7, 3.5);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
}

function drawContactCard(ctx, width, y, height, contact) {
  const gsm = contact?.gsm || contact?.whatsapp || '';
  const cardWidth = width - 120;
  const cardX = (width - cardWidth) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  const colors = brand().colors || {};
  ctx.fillStyle = colors.primary || '#c51f2b';
  roundRectPath(ctx, cardX, y, cardWidth, height, height / 2);
  ctx.fill();
  ctx.strokeStyle = colors.accent || '#d9a441';
  ctx.lineWidth = 3;
  roundRectPath(ctx, cardX, y, cardWidth, height, height / 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const label = `WhatsApp ${gsm}`;
  // ajustement : la police rétrécit jusqu'à ce que contenu + icône tiennent dans la carte
  let labelSize = Math.round(height * 0.36);
  const iconSize = height * 0.42;
  const maxContentWidth = cardWidth - 90;
  let labelWidth = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    ctx.font = `800 ${labelSize}px ${FONT}`;
    labelWidth = ctx.measureText(label).width;
    if (labelWidth + iconSize + 26 <= maxContentWidth) break;
    labelSize -= 2;
  }
  const contentWidth = labelWidth + iconSize + 26;
  const startX = width / 2 - contentWidth / 2;
  drawPhoneIcon(ctx, startX, y + height / 2, iconSize);
  ctx.font = `800 ${labelSize}px ${FONT}`;
  ctx.textAlign = 'center'; // indispensable : l'alignement hérité peut être « start »
  ctx.fillText(label, startX + iconSize + 26 + labelWidth / 2, y + height / 2 + 2);
}

function drawSocials(ctx, width, y, contact) {
  const socials = [contact?.tiktok?.handle, contact?.instagram?.handle].filter(Boolean).join('   ·   ');
  if (!socials) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 34px ${FONT}`;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillText(socials, width / 2, y);
  ctx.restore();
}

// Rend une affiche PNG complète. Retourne le canvas (@napi-rs/canvas).
export async function renderPoster(project, { format = 'story' } = {}) {
  registerStudioFonts();
  const dims = FORMATS[format] || FORMATS.story;
  const width = dims.width;
  const height = dims.height;
  const isStory = format !== 'square';

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const accent = (project?.style?.code === 'viral' && brand().colors?.accent) || PALETTE_BY_STYLE[project?.style?.code] || '#ffbe0b';
  const language = project?.language?.code || 'fr';
  const arabicText = hasArabic(project?.hooks?.[0]) || language === 'ar';
  const directionRtl = language === 'ar';

  // 1. photo de fond
  let background = null;
  try {
    background = await loadImage(backgroundPathFor(project));
  } catch {
    background = null;
  }

  if (background) {
    const coverScale = Math.max(width / background.width, height / background.height);
    const drawW = background.width * coverScale;
    const drawH = background.height * coverScale;
    ctx.drawImage(background, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  } else {
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, width, height);
  }

  // voile général léger pour la cohérence photo/marque
  ctx.fillStyle = 'rgba(7, 10, 18, 0.16)';
  ctx.fillRect(0, 0, width, height);

  // Les effets compris dans la demande libre influencent aussi le PNG final.
  const visualEffects = visualEffectsFor(project);
  if (/lumiere doree|reflets dores|golden|dore|ذهبي/.test(visualEffects)) {
    const gold = ctx.createLinearGradient(0, 0, width, height);
    gold.addColorStop(0, 'rgba(255, 229, 159, 0.22)');
    gold.addColorStop(0.52, 'rgba(255, 190, 11, 0.04)');
    gold.addColorStop(1, 'rgba(76, 42, 8, 0.20)');
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, width, height);
  }
  if (/avant \/ apres|avant apres|before after|قبل وبعد/.test(visualEffects)) {
    ctx.fillStyle = 'rgba(5, 8, 13, 0.25)';
    ctx.fillRect(0, 0, width / 2, height);
    ctx.fillStyle = accent;
    ctx.fillRect(width / 2 - 3, height * 0.12, 6, height * 0.56);
  }

  drawScrims(ctx, width, height, isStory ? { top: 0.16, bottom: 0.52 } : { top: 0.14, bottom: 0.6 });

  // Composition éditoriale inspirée de l’affiche de référence : panneau noir
  // pour la copie, photo conservée côté droit, puis liseré rouge et doré.
  const visualIdentity = brand().visualIdentity || {};
  const brandColors = brand().colors || {};
  const editorialLayout = visualIdentity.posterLayout === 'editorial-grid';
  if (visualIdentity.posterLayout === 'editorial-grid') {
    const editorialPanel = ctx.createLinearGradient(0, 0, width * 0.66, 0);
    editorialPanel.addColorStop(0, 'rgba(5,5,5,0.98)');
    editorialPanel.addColorStop(0.72, 'rgba(5,5,5,0.90)');
    editorialPanel.addColorStop(1, 'rgba(5,5,5,0)');
    ctx.fillStyle = editorialPanel;
    ctx.fillRect(0, 0, width * 0.72, height);
    ctx.fillStyle = brandColors.primary || '#c51f2b';
    ctx.fillRect(width * 0.535, 0, Math.max(8, width * 0.012), height);
    ctx.fillStyle = brandColors.accent || '#d9a441';
    ctx.fillRect(width * 0.535 + Math.max(8, width * 0.012), 0, Math.max(3, width * 0.004), height);
  }

  // 2. marque
  const brandY = isStory ? 190 : 150;
  drawBrand(ctx, width, brandY, accent, editorialLayout ? width * 0.27 : width / 2);

  // 3. badge service · ville
  const badge = `${serviceLabel(project)} · ${project?.input?.city || 'Maroc'}`;
  ctx.save();
  ctx.font = `800 ${isStory ? 38 : 34}px ${FONT}`;
  const badgeWidth = ctx.measureText(badge.toUpperCase()).width + 72;
  const badgeY = isStory ? 260 : 210;
  const primary = brandColors.primary || '#c51f2b';
  ctx.fillStyle = primary;
  roundRectPath(ctx, (width - badgeWidth) / 2, badgeY, badgeWidth, 64, 32);
  ctx.fill();
  ctx.strokeStyle = brandColors.accent || '#d9a441';
  ctx.lineWidth = 3;
  roundRectPath(ctx, (width - badgeWidth) / 2, badgeY, badgeWidth, 64, 32);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badge.toUpperCase(), width / 2, badgeY + 33);
  ctx.restore();

  // 4. titre (hook principal)
  // Titre = le hook le plus percutant qui TIENT sur l'affiche (3 lignes max).
  // On préfère un hook concis complet à un long hook coupé.
  const hooks = (project?.hooks || []).filter(Boolean);
  const headline =
    hooks.find(hook => hook.length >= 25 && hook.length <= 90) ||
    hooks.reduce((shortest, hook) => (hook.length < shortest.length ? hook : shortest), hooks[0]) ||
    '';
  const headY = isStory ? 470 : 350;
  const maxHeadWidth = editorialLayout ? width * 0.48 : width - 130;
  // ajustement : taille décroissante jusqu'à ce que le titre tienne en 3 lignes max
  let headSize = headline.length > 110 ? 72 : headline.length > 60 ? 86 : 96;
  if (!isStory) headSize = Math.min(headSize, 72);
  const layoutHeadline = size => {
    ctx.font = `800 ${size}px ${FONT}`;
    return hasArabic(headline)
      ? wrapBidiLines(ctx, headline, maxHeadWidth, 3, directionRtl)
      : wrapLines(ctx, headline, maxHeadWidth, 3).map(text => ({
          runs: [{ rtl: false, words: text.split(' ') }],
          baseRTL: false
        }));
  };
  let headLines = layoutHeadline(headSize);
  while (headLines.length >= 3 && headSize > 56) {
    headSize -= 6;
    headLines = layoutHeadline(headSize);
  }
  ctx.save();
  ctx.font = `800 ${headSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = editorialLayout ? 'left' : 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 3;
  const headLineHeight = headSize * 1.16;
  const headBlock = headLines.length * headLineHeight;
  const headTop = isStory ? headY : 300;
  drawBidiLines(ctx, headLines, editorialLayout ? width * 0.27 : width / 2, headTop, headLineHeight);
  ctx.restore();

  // 5. arguments (3 max) — coche dessinée + texte, ligne par ligne
  const benefits = benefitsFrom(project, isStory ? 3 : 1);
  const benefitsLeft = editorialLayout ? (isStory ? 90 : 80) : 130;
  const benefitsWidth = editorialLayout ? width * 0.5 - benefitsLeft : width - benefitsLeft * 2;
  let cursorY = headTop + headBlock + (isStory ? 70 : 44);
  if (visualIdentity.posterLayout === 'editorial-grid') {
    const ribbonY = cursorY - (isStory ? 34 : 28);
    const ribbonWidth = isStory ? 330 : 285;
    ctx.fillStyle = primary;
    roundRectPath(ctx, benefitsLeft || 130, ribbonY, ribbonWidth, isStory ? 52 : 44, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${isStory ? 30 : 26}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOS SERVICES', (benefitsLeft || 130) + 24, ribbonY + (isStory ? 26 : 22));
    cursorY += isStory ? 36 : 30;
  }
  ctx.save();
  const benefitSize = editorialLayout ? (isStory ? 34 : 30) : (isStory ? 42 : 38);
  ctx.font = `600 ${benefitSize}px ${FONT}`;
  ctx.textBaseline = 'middle';
  const lineH = editorialLayout ? (isStory ? 43 : 38) : (isStory ? 52 : 48);
  for (const benefit of benefits) {
    const checkSize = isStory ? 34 : 30;
    const textMaxWidth = benefitsWidth - checkSize - 26;
    const isArabic = hasArabic(benefit);
    const textLines = isArabic
      ? wrapBidiLines(ctx, benefit, textMaxWidth, 2, directionRtl).length
      : wrapLines(ctx, benefit, textMaxWidth, 2).length;
    const blockHeight = textLines * lineH;
    const centerY = cursorY + blockHeight / 2;

    drawCheck(ctx, benefitsLeft, centerY, checkSize, accent);
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    if (isArabic) {
      const bidi = wrapBidiLines(ctx, benefit, textMaxWidth, 2, directionRtl);
      ctx.textAlign = 'center';
      drawBidiLines(ctx, bidi, benefitsLeft + checkSize + 26 + textMaxWidth / 2, cursorY, lineH);
    } else {
      const lines = wrapLines(ctx, benefit, textMaxWidth, 2);
      let ly = centerY - (lines.length - 1) * lineH / 2;
      ctx.textAlign = 'left';
      for (const line of lines) {
        ctx.fillText(line, benefitsLeft + checkSize + 26, ly);
        ly += lineH;
      }
    }
    cursorY += blockHeight + (isStory ? 26 : 18);
  }
  ctx.restore();

  // 6. carte contact + réseaux
  const cardHeight = isStory ? 150 : 130;
  const cardY = isStory ? height - 430 : height - 285;
  drawContactCard(ctx, width, cardY, cardHeight, project?.contact);
  drawSocials(ctx, width, isStory ? cardY - 60 : cardY - 50, project?.contact);

  // 7. mention honnête discrète (évite toute promesse implicite)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${isStory ? 26 : 22}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(brandTagline(), width / 2, isStory ? height - 92 : height - 40);
  ctx.restore();

  return canvas;
}

// Nom de fichier propre pour le téléchargement.
export function posterFilename(project, format) {
  const base = String(project?.title || 'affiche-yallah')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'affiche-yallah';
  return `${base}-${format}.png`;
}
