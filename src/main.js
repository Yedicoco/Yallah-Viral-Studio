const form = document.querySelector('#studio-form');
const generateBtn = document.querySelector('#generate-btn');
const viralizeBtn = document.querySelector('#viralize-btn');
const projectTitle = document.querySelector('#project-title');
const scorePill = document.querySelector('#score-pill');
const phoneScene = document.querySelector('#phone-scene');
const sceneEmoji = document.querySelector('#scene-emoji');
const phoneTitle = document.querySelector('#phone-title');
const phoneCaption = document.querySelector('#phone-caption');
const phoneCta = document.querySelector('#phone-cta');
const phoneSocials = document.querySelector('#phone-socials');
const phoneProgress = document.querySelector('#phone-progress-bar');
const scenePager = document.querySelector('#scene-pager');
const tabContent = document.querySelector('#tab-content');
const tabs = document.querySelectorAll('.tab');
const playVoiceBtn = document.querySelector('#play-voice-btn');
const exportJsonBtn = document.querySelector('#export-json-btn');
const exportVideoBtn = document.querySelector('#export-video-btn');
const exportPosterBtn = document.querySelector('#export-poster-btn');
const saveProjectBtn = document.querySelector('#save-project-btn');
const clearLibraryBtn = document.querySelector('#clear-library-btn');
const libraryList = document.querySelector('#library-list');

const STORAGE_KEY = 'yallah-viral-studio-library';

// Coordonnées et pages officielles Yallah Services
// (secours pour les projets sauvegardés avant l'ajout de l'email et des réseaux).
const YALLAH_CONTACT = {
  gsm: '+212 691733585',
  email: 'servicesyallah@gmail.com',
  tiktok: { handle: '@yallah.services.m', url: 'https://www.tiktok.com/@yallah.services.m' },
  instagram: { handle: '@yallahservice', url: 'https://www.instagram.com/yallahservice' }
};

const gradients = [
  'linear-gradient(160deg, rgba(32, 201, 151, .98), rgba(7, 10, 18, .9) 56%, rgba(255, 190, 11, .9))',
  'linear-gradient(160deg, rgba(255, 77, 79, .98), rgba(12, 17, 31, .92) 58%, rgba(255, 190, 11, .88))',
  'linear-gradient(160deg, rgba(132, 94, 247, .98), rgba(7, 10, 18, .92) 58%, rgba(32, 201, 151, .88))',
  'linear-gradient(160deg, rgba(216, 180, 106, .98), rgba(7, 10, 18, .92) 58%, rgba(255, 255, 255, .22))',
  'linear-gradient(160deg, rgba(240, 101, 149, .98), rgba(7, 10, 18, .92) 58%, rgba(255, 190, 11, .75))'
];

let currentProject = null;
let currentSceneIndex = 0;
let activeTab = 'hooks';
let autoplayTimer = null;
let toastTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function collectFormInput() {
  const data = new FormData(form);
  return {
    objective: data.get('objective'),
    city: data.get('city'),
    whatsapp: data.get('whatsapp'),
    email: data.get('email'),
    tiktok: data.get('tiktok'),
    instagram: data.get('instagram'),
    service: data.get('service'),
    duration: Number(data.get('duration')),
    style: data.get('style'),
    language: data.get('language')
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Erreur serveur');
  }

  return response.json();
}

function setBusy(isBusy, label = 'Générer la vidéo') {
  generateBtn.disabled = isBusy;
  viralizeBtn.disabled = isBusy;
  exportVideoBtn.disabled = isBusy;
  exportPosterBtn.disabled = isBusy;
  generateBtn.textContent = isBusy ? 'Création en cours…' : label;
}

async function generateProject(event) {
  event?.preventDefault();
  setBusy(true);
  try {
    const project = await postJson('/api/generate', collectFormInput());
    renderProject(project, { toast: 'Projet généré' });
  } catch (error) {
    showToast(error.message || 'Impossible de générer');
  } finally {
    setBusy(false);
  }
}

async function viralizeProject() {
  setBusy(true, 'Générer la vidéo');
  try {
    const payload = currentProject || collectFormInput();
    const project = await postJson('/api/viralize', { project: payload });
    renderProject(project, { toast: 'Version plus performante générée' });
  } catch (error) {
    showToast(error.message || 'Impossible de viraliser');
  } finally {
    setBusy(false);
  }
}

function renderProject(project, options = {}) {
  currentProject = project;
  const storedContact = currentProject.contact || {};
  currentProject.contact = {
    gsm: storedContact.gsm || currentProject.input?.whatsapp || YALLAH_CONTACT.gsm,
    email: storedContact.email || currentProject.input?.email || YALLAH_CONTACT.email,
    tiktok: storedContact.tiktok || YALLAH_CONTACT.tiktok,
    instagram: storedContact.instagram || YALLAH_CONTACT.instagram
  };
  currentSceneIndex = 0;
  projectTitle.textContent = project.title;
  scorePill.textContent = `${project.optimization.score}/100`;
  scorePill.title = project.optimization.disclaimer;
  document.documentElement.style.setProperty('--score', project.optimization.score);
  renderScenePager();
  renderPhoneScene(0);
  renderActiveTab();
  startAutoplay();
  if (options.toast) showToast(options.toast);
}

function renderScenePager() {
  if (!currentProject) {
    scenePager.innerHTML = '';
    return;
  }

  scenePager.innerHTML = currentProject.script.scenes
    .map((scene, index) => `<button type="button" data-scene="${index}" class="${index === currentSceneIndex ? 'active' : ''}" aria-label="Scène ${scene.number}">${scene.number}</button>`)
    .join('');
}

function renderPhoneScene(index) {
  if (!currentProject) return;
  const scenes = currentProject.script.scenes;
  const scene = scenes[index] || scenes[0];
  currentSceneIndex = index;
  const gradient = gradients[index % gradients.length];
  phoneScene.style.background = `${gradient}`;
  phoneScene.dir = currentProject.voice.direction;
  sceneEmoji.textContent = scene.emoji || '🎬';
  phoneTitle.textContent = scene.onScreenText;
  phoneCaption.textContent = scene.caption;
  phoneCta.textContent = currentProject.cta;
  phoneSocials.textContent = currentProject.socialLine
    || `${YALLAH_CONTACT.tiktok.handle} · ${YALLAH_CONTACT.instagram.handle}`;
  phoneProgress.style.width = `${Math.round(((index + 1) / scenes.length) * 100)}%`;
  renderScenePager();
}

function startAutoplay() {
  clearInterval(autoplayTimer);
  if (!currentProject?.script?.scenes?.length) return;
  autoplayTimer = setInterval(() => {
    const next = (currentSceneIndex + 1) % currentProject.script.scenes.length;
    renderPhoneScene(next);
  }, 3200);
}

function setActiveTab(nextTab) {
  activeTab = nextTab;
  tabs.forEach(tab => {
    const isActive = tab.dataset.tab === activeTab;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  renderActiveTab();
}

function renderActiveTab() {
  if (!currentProject) {
    tabContent.className = 'tab-content empty-state';
    tabContent.innerHTML = `
      <span>✨</span>
      <h3>Prêt à créer</h3>
      <p>Le générateur produira ici hooks, script, scènes, voix off, sous-titres, hashtags et checklist TikTok/Reels.</p>
    `;
    return;
  }

  tabContent.className = 'tab-content';
  const renderers = {
    hooks: renderHooks,
    script: renderScript,
    subtitles: renderSubtitles,
    caption: renderCaption,
    optimize: renderOptimization
  };
  tabContent.innerHTML = renderers[activeTab]();
}

function renderHooks() {
  return `
    <div class="caption-card">
      <header>
        <div>
          <h3>🎯 Hooks TikTok/Reels</h3>
          <p>Choisissez le hook 1 pour un rythme direct, ou testez les autres en A/B.</p>
        </div>
      </header>
    </div>
    ${currentProject.hooks.map((hook, index) => `
      <article class="card hook-card">
        <span class="hook-number">${index + 1}</span>
        <p>${escapeHtml(hook)}</p>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(hook)}">Copier</button>
      </article>
    `).join('')}
  `;
}

function renderScript() {
  return `
    <article class="caption-card" dir="${currentProject.voice.direction}">
      <header>
        <div>
          <h3>🗣️ Voix off complète</h3>
          <p>${escapeHtml(currentProject.voice.note)}</p>
        </div>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(currentProject.script.voiceOver)}">Copier</button>
      </header>
      <div class="voice-box">${escapeHtml(currentProject.script.voiceOver)}</div>
    </article>
    ${currentProject.script.scenes.map(scene => `
      <article class="scene-card" dir="${currentProject.voice.direction}">
        <header>
          <div>
            <h3>${scene.emoji} Scène ${scene.number} · ${escapeHtml(scene.role)}</h3>
            <div class="scene-meta">
              <span>⏱️ ${scene.duration}s</span>
              <span>🎬 ${escapeHtml(scene.transition)}</span>
              <span>🕒 ${scene.startAt}s → ${scene.startAt + scene.duration}s</span>
            </div>
          </div>
          <button type="button" class="copy-btn" data-copy="${escapeHtml(scene.voice)}">Copier voix</button>
        </header>
        <p><strong>Texte écran :</strong> ${escapeHtml(scene.onScreenText)}</p>
        <p><strong>Voix :</strong> ${escapeHtml(scene.voice)}</p>
        <div class="prompt-box"><strong>Prompt scène IA :</strong> ${escapeHtml(scene.prompt)}</div>
      </article>
    `).join('')}
  `;
}

function renderSubtitles() {
  return `
    <article class="caption-card">
      <header>
        <div>
          <h3>📝 Sous-titres dynamiques</h3>
          <p>Découpage prêt pour une timeline verticale, avec textes courts et centraux.</p>
        </div>
      </header>
    </article>
    ${currentProject.subtitles.map(subtitle => `
      <div class="subtitle-row" dir="${currentProject.voice.direction}">
        <time>${formatTime(subtitle.start)} – ${formatTime(subtitle.end)}</time>
        <span>${escapeHtml(subtitle.text)}</span>
      </div>
    `).join('')}
  `;
}

function projectContact() {
  const contact = currentProject?.contact || {};
  return {
    gsm: contact.gsm || YALLAH_CONTACT.gsm,
    email: contact.email || YALLAH_CONTACT.email,
    tiktok: contact.tiktok || YALLAH_CONTACT.tiktok,
    instagram: contact.instagram || YALLAH_CONTACT.instagram
  };
}

function renderContactCard() {
  const contact = projectContact();
  const whatsappDigits = contact.gsm.replace(/[^0-9]/g, '');

  return `
    <article class="caption-card contact-card">
      <header>
        <div>
          <h3>☎️ Coordonnées et pages officielles Yallah Services</h3>
          <p>GSM/WhatsApp, email, TikTok et Instagram injectés dans le CTA, la caption et l'écran final.</p>
        </div>
      </header>
      <div class="contact-actions">
        <a class="contact-link" href="https://wa.me/${encodeURIComponent(whatsappDigits)}" target="_blank" rel="noreferrer">📲 ${escapeHtml(contact.gsm)}</a>
        <a class="contact-link" href="mailto:${encodeURIComponent(contact.email)}">✉️ ${escapeHtml(contact.email)}</a>
        <a class="contact-link" href="${escapeHtml(contact.tiktok.url)}" target="_blank" rel="noreferrer">🎵 TikTok ${escapeHtml(contact.tiktok.handle)}</a>
        <a class="contact-link" href="${escapeHtml(contact.instagram.url)}" target="_blank" rel="noreferrer">📸 Instagram ${escapeHtml(contact.instagram.handle)}</a>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(contact.gsm)}">Copier GSM</button>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(contact.email)}">Copier email</button>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(contact.tiktok.url)}">Copier TikTok</button>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(contact.instagram.url)}">Copier Instagram</button>
      </div>
      ${currentProject.followCta ? `
        <div class="voice-box">
          <strong>CTA de suivi :</strong> ${escapeHtml(currentProject.followCta)}
          <button type="button" class="copy-btn" data-copy="${escapeHtml(currentProject.followCta)}">Copier</button>
        </div>
      ` : ''}
      ${currentProject.socialLine ? `
        <div class="voice-box">
          <strong>Ligne réseaux (caption) :</strong> ${escapeHtml(currentProject.socialLine)}
          <button type="button" class="copy-btn" data-copy="${escapeHtml(currentProject.socialLine)}">Copier</button>
        </div>
      ` : ''}
    </article>
  `;
}

function renderCaption() {
  return `
    <article class="caption-card" dir="${currentProject.voice.direction}">
      <header>
        <div>
          <h3>📢 Caption + CTA WhatsApp</h3>
          <p>Caption pensée pour clarté commerciale et passage à l’action.</p>
        </div>
        <button type="button" class="copy-btn" data-copy="${escapeHtml(`${currentProject.caption}\n\n${currentProject.hashtags.join(' ')}`)}">Copier tout</button>
      </header>
      <p>${escapeHtml(currentProject.caption).replaceAll('\n', '<br />')}</p>
      <div class="voice-box"><strong>CTA :</strong> ${escapeHtml(currentProject.cta)}</div>
    </article>
    ${renderContactCard()}
    <article class="caption-card">
      <header>
        <div>
          <h3>#️⃣ Hashtags adaptés</h3>
          <p>Mix marque + ville + service + intention TikTok/Reels.</p>
        </div>
      </header>
      <div class="hashtag-list">${currentProject.hashtags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    </article>
    <article class="caption-card">
      <header>
        <div>
          <h3>🎵 Musique & mix</h3>
          <p>${escapeHtml(currentProject.music.brief)}</p>
        </div>
      </header>
      <div class="voice-box">${escapeHtml(currentProject.music.volume)}</div>
    </article>
  `;
}

function renderOptimization() {
  const optimization = currentProject.optimization;
  const beforeAfter = optimization.before
    ? `<p><span class="badge">Avant : ${optimization.before}/100</span> <span class="badge">Après : ${optimization.after}/100</span></p>`
    : '';

  return `
    <article class="caption-card score-card">
      <div class="score-circle" style="--score: ${optimization.score}">${optimization.score}</div>
      <div>
        <h3>🧠 ${escapeHtml(optimization.label)}</h3>
        <p>${escapeHtml(optimization.disclaimer)}</p>
        <p><span class="badge">Durée : ${optimization.totalDuration}s</span> <span class="badge">Format : ${escapeHtml(currentProject.export.format)}</span> <span class="badge">${escapeHtml(currentProject.language.label)}</span></p>
        ${beforeAfter}
      </div>
    </article>
    ${(currentProject.improvementNotes || []).length ? `
      <article class="caption-card">
        <h3>🔥 Améliorations “Rendre plus viral”</h3>
        <ul>
          ${currentProject.improvementNotes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}
        </ul>
      </article>
    ` : ''}
    ${optimization.checks.map(check => `
      <article class="check-card ${escapeHtml(check.status)}">
        <span class="check-icon">${check.status === 'ok' ? '✅' : '⚠️'}</span>
        <div>
          <h3>${escapeHtml(check.label)}</h3>
          <p>${escapeHtml(check.tip)}</p>
        </div>
      </article>
    `).join('')}
  `;
}

function formatTime(seconds) {
  const value = Number(seconds) || 0;
  return `00:${String(value).padStart(2, '0')}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 2300);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copié');
  } catch {
    showToast('Copie impossible dans ce navigateur');
  }
}

function getLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function setLibrary(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 24)));
  renderLibrary();
}

function saveCurrentProject() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }
  const library = getLibrary().filter(item => item.id !== currentProject.id);
  setLibrary([{ ...currentProject, savedAt: new Date().toISOString() }, ...library]);
  showToast('Projet sauvé dans la bibliothèque');
}

function renderLibrary() {
  const library = getLibrary();
  if (!library.length) {
    libraryList.innerHTML = `
      <div class="empty-state card">
        <span>📁</span>
        <h3>Aucune vidéo sauvegardée</h3>
        <p>Générez un projet puis cliquez sur “Sauver”.</p>
      </div>
    `;
    return;
  }

  libraryList.innerHTML = library.map(project => `
    <article class="library-item">
      <div>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${new Date(project.savedAt || project.createdAt).toLocaleString('fr-FR')} · ${project.script.duration}s · ${escapeHtml(project.style.label)} · ${project.optimization.score}/100</p>
      </div>
      <div class="library-actions">
        <button type="button" class="secondary-btn" data-load="${escapeHtml(project.id)}">Ouvrir</button>
        <button type="button" class="secondary-btn" data-export="${escapeHtml(project.id)}">JSON</button>
        <button type="button" class="secondary-btn" data-delete="${escapeHtml(project.id)}">Supprimer</button>
      </div>
    </article>
  `).join('');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportJson(project = currentProject) {
  if (!project) {
    showToast('Aucun projet à exporter');
    return;
  }
  const filename = `${project.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'yallah-video'}.json`;
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), filename);
  showToast('Export JSON lancé');
}

function playVoiceOver() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }

  if (!('speechSynthesis' in window)) {
    showToast('Synthèse vocale non disponible');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(currentProject.script.voiceOver);
  utterance.lang = currentProject.voice.language;
  utterance.rate = currentProject.input.duration === 15 ? 1.08 : 1;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth || !currentLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function getSceneAt(project, elapsedSeconds) {
  return project.script.scenes.find(scene => elapsedSeconds >= scene.startAt && elapsedSeconds < scene.startAt + scene.duration)
    || project.script.scenes.at(-1);
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawVideoFrame(ctx, canvas, project, elapsedSeconds) {
  const scene = getSceneAt(project, elapsedSeconds);
  const index = Math.max(0, project.script.scenes.indexOf(scene));
  const width = canvas.width;
  const height = canvas.height;
  const styleColor = project.style.color || '#20c997';
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#06131d');
  gradient.addColorStop(0.52, '#0b2230');
  gradient.addColorStop(1, index % 2 ? '#20c997' : '#ffbe0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = -height; x < width; x += 54) {
    ctx.fillRect(x + (elapsedSeconds * 20) % 54, 0, 3, height);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.fillRect(0, height * 0.58, width, height * 0.42);

  ctx.fillStyle = '#ffbe0b';
  ctx.font = '900 26px Inter, Arial, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('YALLAH SERVICES', 58, 100);
  ctx.fillStyle = '#20c997';
  drawRoundRect(ctx, 58, 126, 92, 8, 4);
  ctx.fill();

  const handles = project.socialLine
    ? `${project.contact?.tiktok?.handle || ''} · ${project.contact?.instagram?.handle || ''}`
    : '';
  if (handles) {
    ctx.font = '700 22px Inter, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(handles, width - 58, 100);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  drawRoundRect(ctx, 58, 178, 604, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 25px Inter, Arial, sans-serif';
  ctx.fillText(`SCÈNE ${String(index + 1).padStart(2, '0')}  ·  ${String(project.input?.service || 'SERVICE').toUpperCase()}`, 84, 195);

  ctx.textBaseline = 'top';
  ctx.font = '900 56px Inter, Arial, sans-serif';
  const titleLines = wrapText(ctx, scene.onScreenText, width - 116).slice(0, 4);
  let y = height - 500;
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 14;
  for (const line of titleLines) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 58, y);
    y += 64;
  }
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#d9f7ef';
  ctx.font = '700 30px Inter, Arial, sans-serif';
  const captionLines = wrapText(ctx, scene.caption, width - 116).slice(0, 2);
  y += 16;
  for (const line of captionLines) {
    ctx.fillText(line, 58, y);
    y += 40;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  drawRoundRect(ctx, 58, height - 120, width - 116, 58, 29);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px Inter, Arial, sans-serif';
  ctx.fillText(project.cta.slice(0, 48), 84, height - 104);

  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  drawRoundRect(ctx, 58, height - 44, width - 116, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  const progress = Math.min(1, elapsedSeconds / project.script.duration);
  drawRoundRect(ctx, 58, height - 44, (width - 116) * progress, 10, 5);
  ctx.fill();
}

function drawPosterFrame(ctx, canvas, project) {
  const width = canvas.width;
  const height = canvas.height;
  const scene = project.script.scenes[0] || {};
  const gold = '#ffbe0b';
  const teal = '#20c997';
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#06131d');
  bg.addColorStop(0.58, '#0b2230');
  bg.addColorStop(1, '#071018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,190,11,0.12)';
  ctx.beginPath();
  ctx.arc(width - 40, 120, 280, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(32,201,151,0.12)';
  ctx.beginPath();
  ctx.arc(70, height - 160, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = gold;
  ctx.font = '900 38px Inter, Arial, sans-serif';
  ctx.fillText('YALLAH SERVICES', 72, 92);
  ctx.fillStyle = teal;
  drawRoundRect(ctx, 72, 116, 132, 10, 5);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawRoundRect(ctx, 72, 164, 360, 54, 27);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 24px Inter, Arial, sans-serif';
  ctx.fillText(String(project.input?.service || 'SERVICE').toUpperCase(), 98, 181);

  ctx.textBaseline = 'top';
  ctx.font = '900 76px Inter, Arial, sans-serif';
  const title = scene.onScreenText || project.title || 'Votre besoin, notre solution';
  const titleLines = wrapText(ctx, title, width - 144).slice(0, 4);
  let y = 290;
  for (const line of titleLines) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 72, y);
    y += 86;
  }

  ctx.fillStyle = '#d9f7ef';
  ctx.font = '600 34px Inter, Arial, sans-serif';
  const bodyLines = wrapText(ctx, scene.caption || '', width - 144).slice(0, 3);
  y += 28;
  for (const line of bodyLines) {
    ctx.fillText(line, 72, y);
    y += 48;
  }

  const ctaY = height - 230;
  ctx.fillStyle = teal;
  drawRoundRect(ctx, 72, ctaY, width - 144, 86, 43);
  ctx.fill();
  ctx.fillStyle = '#062019';
  ctx.font = '900 30px Inter, Arial, sans-serif';
  ctx.fillText((project.cta || 'Contactez-nous sur WhatsApp').slice(0, 46), 104, ctaY + 27);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '600 24px Inter, Arial, sans-serif';
  ctx.fillText(`WhatsApp : ${project.contact?.gsm || ''}`, 72, height - 108);
  ctx.fillText(`${project.contact?.instagram?.handle || '@yallahservice'}  ·  ${project.contact?.tiktok?.handle || '@yallah.services.m'}`, 72, height - 68);
}

function exportPoster() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  drawPosterFrame(canvas.getContext('2d'), canvas, currentProject);
  canvas.toBlob(blob => {
    if (!blob) {
      showToast('Export affiche impossible');
      return;
    }
    const filename = `${currentProject.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'yallah-affiche'}.png`;
    downloadBlob(blob, filename);
    showToast('Affiche PNG exportée');
  }, 'image/png');
}

async function exportVideoMockup() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }

  if (!('MediaRecorder' in window)) {
    showToast('Export vidéo non supporté par ce navigateur');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  const done = new Promise(resolve => {
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
  });

  const previousText = exportVideoBtn.textContent;
  exportVideoBtn.disabled = true;
  recorder.start();
  const startedAt = performance.now();
  const totalMs = currentProject.script.duration * 1000;

  await new Promise(resolve => {
    function frame(now) {
      const elapsed = Math.min(totalMs, now - startedAt);
      drawVideoFrame(ctx, canvas, currentProject, elapsed / 1000);
      exportVideoBtn.textContent = `🎞️ Export ${Math.round((elapsed / totalMs) * 100)}%`;
      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        requestAnimationFrame(() => {
          recorder.stop();
          resolve();
        });
      }
    }
    requestAnimationFrame(frame);
  });

  const blob = await done;
  exportVideoBtn.disabled = false;
  exportVideoBtn.textContent = previousText;
  const filename = `${currentProject.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'yallah-video'}.webm`;
  downloadBlob(blob, filename);
  showToast('Export WebM lancé');
}

form.addEventListener('submit', generateProject);
viralizeBtn.addEventListener('click', viralizeProject);
playVoiceBtn.addEventListener('click', playVoiceOver);
exportJsonBtn.addEventListener('click', () => exportJson());
exportVideoBtn.addEventListener('click', exportVideoMockup);
exportPosterBtn.addEventListener('click', exportPoster);
saveProjectBtn.addEventListener('click', saveCurrentProject);
clearLibraryBtn.addEventListener('click', () => {
  setLibrary([]);
  showToast('Bibliothèque vidée');
});

scenePager.addEventListener('click', event => {
  const button = event.target.closest('[data-scene]');
  if (!button) return;
  clearInterval(autoplayTimer);
  renderPhoneScene(Number(button.dataset.scene));
});

document.querySelector('.tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  setActiveTab(button.dataset.tab);
});

tabContent.addEventListener('click', event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  copyText(button.dataset.copy);
});

libraryList.addEventListener('click', event => {
  const loadButton = event.target.closest('[data-load]');
  const deleteButton = event.target.closest('[data-delete]');
  const exportButton = event.target.closest('[data-export]');
  const library = getLibrary();

  if (loadButton) {
    const project = library.find(item => item.id === loadButton.dataset.load);
    if (project) renderProject(project, { toast: 'Projet ouvert' });
  }

  if (deleteButton) {
    setLibrary(library.filter(item => item.id !== deleteButton.dataset.delete));
    showToast('Projet supprimé');
  }

  if (exportButton) {
    const project = library.find(item => item.id === exportButton.dataset.export);
    exportJson(project);
  }
});

renderLibrary();
generateProject();
