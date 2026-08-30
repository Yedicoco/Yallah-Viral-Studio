// Moteur de dessin partagé avec le rendu serveur (maquette WebM = frames du MP4).
import { drawStudioFrame, fallbackTimeline } from '/lib/frame-draw.mjs';

const form = document.querySelector('#studio-form');
const autoForm = document.querySelector('#auto-studio-form');
const autoPrompt = document.querySelector('#auto-prompt');
const autoPromptCounter = document.querySelector('#auto-prompt-counter');
const autoCreateBtn = document.querySelector('#auto-create-btn');
const autoStatus = document.querySelector('#auto-status');
const autoStatusIcon = document.querySelector('#auto-status-icon');
const autoStatusTitle = document.querySelector('#auto-status-title');
const autoStatusDetail = document.querySelector('#auto-status-detail');
const autoInterpretation = document.querySelector('#auto-interpretation');
const autoInterpretationChips = document.querySelector('#auto-interpretation-chips');
const autoEffectSummary = document.querySelector('#auto-effect-summary');
const autoResultActions = document.querySelector('#auto-result-actions');
const autoPosterDownload = document.querySelector('#auto-poster-download');
const autoVideoFollow = document.querySelector('#auto-video-follow');
const generateBtn = document.querySelector('#generate-btn');
const viralizeBtn = document.querySelector('#viralize-btn');
const projectTitle = document.querySelector('#project-title');
const scorePill = document.querySelector('#score-pill');
const enginePill = document.querySelector('#engine-pill');
const llmStatusLine = document.querySelector('#llm-status-line');
const voiceStatusLine = document.querySelector('#voice-status-line');
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
const posterStoryBtn = document.querySelector('#poster-story-btn');
const posterSquareBtn = document.querySelector('#poster-square-btn');
const renderMp4Btn = document.querySelector('#render-mp4-btn');
const aiRenderPanel = document.querySelector('#ai-render-panel');
const aiRenderStage = document.querySelector('#ai-render-stage');
const aiRenderPercent = document.querySelector('#ai-render-percent');
const aiRenderBarFill = document.querySelector('#ai-render-bar-fill');
const aiRenderNote = document.querySelector('#ai-render-note');
const aiRenderResult = document.querySelector('#ai-render-result');
const aiRenderVideo = document.querySelector('#ai-render-video');
const aiRenderMeta = document.querySelector('#ai-render-meta');
const aiRenderDownload = document.querySelector('#ai-render-download');
const playVoiceBtn = document.querySelector('#play-voice-btn');
const exportJsonBtn = document.querySelector('#export-json-btn');
const exportVideoBtn = document.querySelector('#export-video-btn');
const saveProjectBtn = document.querySelector('#save-project-btn');
const clearLibraryBtn = document.querySelector('#clear-library-btn');
const libraryList = document.querySelector('#library-list');
const authOverlay = document.querySelector('#auth-overlay');
const authChecking = document.querySelector('#auth-checking');
const authContent = document.querySelector('#auth-content');
const authError = document.querySelector('#auth-error');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const showLoginBtn = document.querySelector('#show-login-btn');
const showRegisterBtn = document.querySelector('#show-register-btn');
const accountControls = document.querySelector('#account-controls');
const accountName = document.querySelector('#account-name');
const logoutBtn = document.querySelector('#logout-btn');

// Ancienne clé conservée uniquement pour migrer une bibliothèque locale vers
// le stockage serveur privé au premier login.
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
let renderPollTimer = null;
let activeRenderJobId = null;
let automaticRenderJobId = null;
let latestAutomaticPoster = null;
let csrfToken = null;
let currentUser = null;
let libraryCache = [];
let appStarted = false;

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
    language: data.get('language'),
    creativeDirection: (data.get('creativeDirection') || '').trim(),
    customVoice: (data.get('customVoice') || '').trim()
  };
}

async function requestJson(url, { method = 'GET', payload, useCsrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (useCsrf && csrfToken && !['GET', 'HEAD'].includes(method)) {
    headers['X-YVS-CSRF'] = csrfToken;
  }
  const response = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({ error: response.statusText }));
  if (!response.ok) {
    const error = new Error(data.error || 'Erreur serveur');
    error.code = data.code;
    error.status = response.status;
    if (response.status === 401 && !url.startsWith('/api/auth/')) showAuthGate();
    throw error;
  }
  return data;
}

function postJson(url, payload) {
  return requestJson(url, { method: 'POST', payload });
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  showLoginBtn.classList.toggle('active', isLogin);
  showRegisterBtn.classList.toggle('active', !isLogin);
  showLoginBtn.setAttribute('aria-selected', String(isLogin));
  showRegisterBtn.setAttribute('aria-selected', String(!isLogin));
  authError.hidden = true;
}

function showAuthGate({ checking = false, registrationEnabled = true } = {}) {
  authOverlay.hidden = false;
  authChecking.hidden = !checking;
  authContent.hidden = checking;
  document.body.classList.toggle('auth-pending', checking);
  document.body.classList.toggle('auth-required', !checking);
  showRegisterBtn.hidden = !registrationEnabled;
  if (!registrationEnabled && !loginForm.hidden) setAuthMode('login');
  accountControls.hidden = true;
}

async function migrateLegacyLibrary() {
  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || !legacy.length) return;

  let migrated = 0;
  for (const project of legacy.slice(0, 24)) {
    try {
      await postJson('/api/projects', { project });
      migrated += 1;
    } catch {
      break;
    }
  }
  if (migrated === Math.min(legacy.length, 24)) {
    localStorage.removeItem(STORAGE_KEY);
    showToast(`${migrated} ancien${migrated > 1 ? 's' : ''} projet${migrated > 1 ? 's' : ''} migré${migrated > 1 ? 's' : ''} vers votre compte`);
  }
}

async function activateAuthenticatedApp(session, { generate = false } = {}) {
  currentUser = session.user || null;
  csrfToken = session.csrfToken || null;
  document.body.classList.remove('auth-pending', 'auth-required');
  authOverlay.hidden = true;
  accountControls.hidden = !currentUser;
  accountName.textContent = currentUser?.displayName || currentUser?.email || '';
  await migrateLegacyLibrary();
  await loadLibrary();
  refreshLlmStatusLine();
  refreshVoiceStatusLine();
  if (generate && (!appStarted || !currentProject)) await generateProject();
  appStarted = true;
}

async function bootstrapAuth() {
  showAuthGate({ checking: true });
  try {
    const session = await requestJson('/api/auth/session', { useCsrf: false });
    if (session.authenticated) {
      await activateAuthenticatedApp(session);
      return;
    }
    showAuthGate({ registrationEnabled: session.registrationEnabled !== false });
  } catch (error) {
    showAuthGate({ registrationEnabled: false });
    authError.textContent = error.message || 'Le serveur est indisponible.';
    authError.hidden = false;
  }
}

async function submitAuth(formElement, endpoint) {
  const submit = formElement.querySelector('button[type="submit"]');
  const previous = submit.textContent;
  const values = Object.fromEntries(new FormData(formElement));
  submit.disabled = true;
  submit.textContent = 'Vérification…';
  authError.hidden = true;
  try {
    const session = await requestJson(endpoint, {
      method: 'POST',
      payload: values,
      useCsrf: false
    });
    formElement.reset();
    await activateAuthenticatedApp(session);
    showToast(endpoint.endsWith('/register') ? 'Compte créé avec succès' : 'Connexion réussie');
  } catch (error) {
    authError.textContent = error.message || 'Authentification impossible.';
    authError.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = previous;
  }
}

async function logout() {
  try {
    await requestJson('/api/auth/logout', { method: 'POST' });
  } catch {
    // Même si le serveur a déjà expiré la session, verrouiller l'interface.
  }
  csrfToken = null;
  currentUser = null;
  currentProject = null;
  libraryCache = [];
  appStarted = false;
  resetAiRenderPanel();
  latestAutomaticPoster = null;
  autoResultActions.hidden = true;
  autoInterpretation.hidden = true;
  setAutoStatus('ready', 'Prêt à créer', 'Décrivez votre idée puis choisissez le résultat souhaité.');
  renderLibrary();
  showAuthGate();
  setAuthMode('login');
}

function setBusy(isBusy, label = 'Générer la vidéo') {
  generateBtn.disabled = isBusy;
  viralizeBtn.disabled = isBusy;
  exportVideoBtn.disabled = isBusy;
  generateBtn.textContent = isBusy ? 'Création en cours…' : label;
}

function setAutoBusy(isBusy, label = 'Créer automatiquement') {
  autoCreateBtn.disabled = isBusy;
  autoCreateBtn.textContent = isBusy ? label : `✨ ${label}`;
}

function setAutoStatus(state, title, detail) {
  const icons = { ready: '💡', working: '⏳', success: '✅', error: '⚠️' };
  autoStatus.dataset.state = state;
  autoStatusIcon.textContent = icons[state] || icons.ready;
  autoStatusTitle.textContent = title;
  autoStatusDetail.textContent = detail || '';
}

function syncAdvancedForm(input = {}) {
  const setValue = (name, value) => {
    if (value === undefined || value === null) return;
    const control = form.elements.namedItem(name);
    if (control) control.value = String(value);
  };
  for (const name of ['objective', 'city', 'service', 'duration', 'style', 'language', 'creativeDirection']) {
    setValue(name, input[name]);
  }
  setValue('customVoice', '');
}

function renderAutomaticInterpretation(interpretation) {
  const durationLabel = interpretation.requestedDuration
    && Number(interpretation.requestedDuration) !== Number(interpretation.duration)
    ? `${interpretation.duration} s (adapté depuis ${interpretation.requestedDuration} s)`
    : `${interpretation.duration} s`;
  const chips = [
    `🎯 ${interpretation.serviceLabel}`,
    `📍 ${interpretation.city}`,
    `🗣️ ${interpretation.languageLabel}`,
    `⏱️ ${durationLabel}`,
    `🎨 ${interpretation.styleLabel}`,
    `📦 ${interpretation.outputLabel}`
  ];
  if (interpretation.output === 'poster' || interpretation.output === 'both') {
    chips.push(`📐 ${interpretation.posterFormatLabel}`);
  }
  autoInterpretationChips.replaceChildren(...chips.map(label => {
    const chip = document.createElement('span');
    chip.textContent = label;
    return chip;
  }));
  const effects = Array.isArray(interpretation.effects) ? interpretation.effects.join(' · ') : '';
  autoEffectSummary.textContent = `Effet et ambiance : ${effects || interpretation.creativeDirection}`;
  autoInterpretation.hidden = false;
}

async function triggerAutomaticPosterDownload({ notify = false } = {}) {
  if (!latestAutomaticPoster?.dataUrl) {
    if (notify) showToast('Aucune affiche automatique disponible');
    return false;
  }
  try {
    const blob = await (await fetch(latestAutomaticPoster.dataUrl)).blob();
    downloadBlob(blob, latestAutomaticPoster.filename || 'yallah-services-affiche.png');
    if (notify) showToast('Téléchargement de l’affiche lancé');
    return true;
  } catch {
    if (notify) showToast('Téléchargement impossible. Réessayez.');
    return false;
  }
}

async function createAutomatically(event) {
  event?.preventDefault();
  if (!autoForm.reportValidity()) return;

  const data = new FormData(autoForm);
  const prompt = String(data.get('prompt') || '').trim();
  const output = String(data.get('autoOutput') || 'both');
  let keepBusyForVideo = false;

  latestAutomaticPoster = null;
  autoResultActions.hidden = true;
  autoPosterDownload.hidden = true;
  autoVideoFollow.hidden = true;
  autoInterpretation.hidden = true;
  setAutoBusy(true, 'Analyse de votre idée…');
  setAutoStatus('working', 'Je comprends votre demande…', 'Service, ville, langue, style, durée et effet sont détectés automatiquement.');

  try {
    const result = await postJson('/api/auto-create', { prompt, output });
    renderProject(result.project);
    syncAdvancedForm(result.project.input);
    renderAutomaticInterpretation(result.interpretation);
    libraryCache = [result.project, ...libraryCache.filter(item => item.id !== result.project.id)].slice(0, 24);
    renderLibrary();

    let posterDownloaded = false;
    if (result.poster) {
      latestAutomaticPoster = result.poster;
      autoPosterDownload.hidden = false;
      autoResultActions.hidden = false;
      setAutoStatus('working', 'Affiche terminée…', 'Le téléchargement du PNG démarre. La vidéo peut continuer en parallèle.');
      posterDownloaded = await triggerAutomaticPosterDownload();
    }

    if (result.videoJob) {
      keepBusyForVideo = true;
      autoVideoFollow.hidden = false;
      autoResultActions.hidden = false;
      trackAiRenderJob(result.videoJob, { automatic: true });
      setAutoBusy(true, 'Vidéo en cours · 0 %');
      setAutoStatus(
        'working',
        result.poster ? 'Affiche prête · vidéo en cours' : 'Vidéo en cours de création',
        `${posterDownloaded ? 'Affiche téléchargée. ' : ''}La voix off, la musique, les sous-titres, l’animation et le MP4 sont produits automatiquement.`
      );
      document.querySelector('.results-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast(result.poster ? 'Affiche prête, vidéo en cours 🎬' : 'Création de la vidéo lancée 🎬');
    } else {
      const warning = Array.isArray(result.warnings) && result.warnings.length ? result.warnings[0] : '';
      setAutoStatus(
        warning ? 'error' : 'success',
        warning ? 'Affiche prête · vidéo à relancer' : 'Création terminée',
        warning || (posterDownloaded
          ? 'Votre affiche a été téléchargée et le projet est sauvegardé dans votre bibliothèque.'
          : 'Votre projet est prêt et sauvegardé dans votre bibliothèque privée.')
      );
      showToast(warning ? 'Affiche prête, vidéo momentanément indisponible' : 'Création automatique terminée ✨');
    }
  } catch (error) {
    setAutoStatus('error', 'Création interrompue', error.message || 'Réessayez dans un instant.');
    showToast(error.message || 'Création automatique impossible');
  } finally {
    if (!keepBusyForVideo) setAutoBusy(false);
  }
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
  const engine = project.textEngine || {};
  if (engine.kind === 'llm') {
    enginePill.textContent = `✍️ LLM · ${engine.model || engine.provider || 'local'}`;
    enginePill.title = engine.note || 'Textes générés par un LLM local open source, puis validés.';
    enginePill.classList.add('llm');
  } else {
    enginePill.textContent = '✍️ Templates';
    enginePill.title = engine.note || 'Moteur de templates déterministe.';
    enginePill.classList.remove('llm');
  }
  document.documentElement.style.setProperty('--score', project.optimization.score);
  renderScenePager();
  renderPhoneScene(0);
  renderActiveTab();
  startAutoplay();
  resetAiRenderPanel();
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
  return libraryCache;
}

async function loadLibrary() {
  if (!currentUser) {
    libraryCache = [];
    renderLibrary();
    return;
  }
  try {
    const result = await requestJson('/api/projects?limit=24');
    libraryCache = Array.isArray(result.projects) ? result.projects : [];
  } catch (error) {
    libraryCache = [];
    showToast(error.message || 'Bibliothèque indisponible');
  }
  renderLibrary();
}

async function saveCurrentProject() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }
  saveProjectBtn.disabled = true;
  try {
    const result = await postJson('/api/projects', { project: currentProject });
    libraryCache = [result.project, ...libraryCache.filter(item => item.id !== currentProject.id)].slice(0, 24);
    renderLibrary();
    showToast('Projet sauvé dans votre bibliothèque privée');
  } catch (error) {
    showToast(error.message || 'Sauvegarde impossible');
  } finally {
    saveProjectBtn.disabled = false;
  }
}

function renderLibrary() {
  const library = getLibrary();
  if (!library.length) {
    libraryList.innerHTML = `
      <div class="empty-state card">
        <span>📁</span>
        <h3>Aucune création sauvegardée</h3>
        <p>Votre prochaine création automatique apparaîtra ici.</p>
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
  // L'APK expose un pont minimal pour enregistrer les exports blob/dataURL
  // (JSON, PNG et maquette WebM) dans le dossier Téléchargements Android.
  if (typeof window.YallahAndroid?.saveBase64 === 'function') {
    const reader = new FileReader();
    reader.onerror = () => showToast('Export mobile impossible');
    reader.onload = () => {
      const encoded = String(reader.result || '').split(',')[1];
      if (!encoded) {
        showToast('Export mobile invalide');
        return;
      }
      window.YallahAndroid.saveBase64(filename, blob.type || 'application/octet-stream', encoded);
    };
    reader.readAsDataURL(blob);
    return;
  }

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

// ---------- Rendu vidéo IA (pipeline open source serveur) ----------

function resetAiRenderPanel() {
  const stoppedAutomaticTracking = Boolean(automaticRenderJobId);
  clearInterval(renderPollTimer);
  renderPollTimer = null;
  activeRenderJobId = null;
  automaticRenderJobId = null;
  if (stoppedAutomaticTracking) setAutoBusy(false);
  aiRenderPanel.hidden = true;
  aiRenderResult.hidden = true;
  aiRenderVideo.removeAttribute('src');
  aiRenderDownload.removeAttribute('href');
  renderMp4Btn.disabled = false;
  renderMp4Btn.textContent = '🎬 Générer la vidéo IA (MP4)';
}

function setAiRenderProgress(stage, progress, note) {
  aiRenderPanel.hidden = false;
  aiRenderStage.textContent = stage;
  aiRenderPercent.textContent = `${Math.round(progress * 100)}%`;
  aiRenderBarFill.style.width = `${Math.round(progress * 100)}%`;
  if (note) aiRenderNote.textContent = note;
}

function trackAiRenderJob(job, { automatic = false } = {}) {
  clearInterval(renderPollTimer);
  activeRenderJobId = job.id;
  automaticRenderJobId = automatic ? job.id : null;
  renderMp4Btn.disabled = true;
  renderMp4Btn.textContent = '⏳ Rendu en cours…';
  if (automatic) {
    autoVideoFollow.href = '#ai-render-panel';
    autoVideoFollow.removeAttribute('download');
    autoVideoFollow.textContent = '🎬 Suivre la création de la vidéo';
  }
  setAiRenderProgress(job.stage, Math.max(job.progress, 0.01), 'Le rendu tourne côté serveur. Vous pouvez continuer à consulter le projet.');
  renderPollTimer = setInterval(pollAiRenderStatus, 1500);
  void pollAiRenderStatus();
}

// ---------- Affiches professionnelles (PNG) ----------

async function downloadPoster(format) {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }
  const button = format === 'square' ? posterSquareBtn : posterStoryBtn;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = '🖼️ Composition…';
  try {
    const result = await postJson('/api/poster-render', { project: currentProject, format });
    const blob = await (await fetch(result.dataUrl)).blob();
    downloadBlob(blob, result.filename);
    showToast(`Affiche ${format === 'square' ? 'carrée' : 'Story'} téléchargée`);
  } catch (error) {
    showToast(error.message || 'Échec du rendu de l’affiche');
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function startAiRender() {
  if (!currentProject) {
    showToast('Générez d’abord un projet');
    return;
  }
  const voiceText = (document.querySelector('#custom-voice')?.value || '').trim();
  const isPosterMode = Boolean(voiceText);
  renderMp4Btn.disabled = true;
  renderMp4Btn.textContent = '⏳ Rendu en cours…';
  setAiRenderProgress('Envoi du projet au moteur de rendu…', 0,
    isPosterMode
      ? 'Votre texte devient une vraie voix off posée sur l’affiche animée.'
      : 'Voix off synthétisée scène par scène, puis montage animé et encodage H.264.');

  try {
    const job = await postJson('/api/video-render', {
      project: currentProject,
      mode: isPosterMode ? 'poster' : 'scenario',
      voiceText
    });
    trackAiRenderJob(job);
  } catch (error) {
    showToast(error.message || 'Impossible de lancer le rendu');
    renderMp4Btn.disabled = false;
    renderMp4Btn.textContent = '🎬 Générer la vidéo IA (MP4)';
  }
}

async function pollAiRenderStatus() {
  const jobId = activeRenderJobId;
  if (!jobId) return;
  const isAutomatic = automaticRenderJobId === jobId;
  try {
    const status = await requestJson(`/api/video-status/${encodeURIComponent(jobId)}`);
    if (activeRenderJobId !== jobId) return;

    if (status.status === 'error') {
      clearInterval(renderPollTimer);
      renderPollTimer = null;
      setAiRenderProgress('Échec du rendu', 0, status.error || 'Erreur inconnue');
      showToast(status.error || 'Le rendu a échoué');
      renderMp4Btn.disabled = false;
      renderMp4Btn.textContent = '🎬 Réessayer le rendu IA';
      if (isAutomatic) {
        automaticRenderJobId = null;
        setAutoBusy(false);
        setAutoStatus('error', 'La vidéo n’a pas pu être terminée', status.error || 'Le projet reste sauvegardé : vous pouvez relancer le rendu.');
        autoVideoFollow.href = '#ai-render-panel';
        autoVideoFollow.textContent = '🎬 Voir l’erreur et réessayer';
      }
      return;
    }

    const progress = Math.max(status.progress, 0.02);
    setAiRenderProgress(status.stage, progress);
    if (isAutomatic) {
      setAutoBusy(true, `Vidéo en cours · ${Math.round(progress * 100)} %`);
      setAutoStatus('working', 'Votre vidéo se construit…', `${status.stage} · voix off, musique, animation et sous-titres inclus.`);
    }

    if (status.status === 'done' && status.video) {
      clearInterval(renderPollTimer);
      renderPollTimer = null;
      aiRenderResult.hidden = false;
      aiRenderVideo.src = status.video.url;
      aiRenderDownload.href = status.video.url;
      aiRenderDownload.setAttribute('download', status.video.filename);
      const sizeMb = (status.video.sizeBytes / (1024 * 1024)).toFixed(1);
      const engine = status.project?.render?.voiceEngine || 'voix synthétisée';
      aiRenderMeta.innerHTML = `
        <span>✅ ${status.video.durationSeconds}s · 720×1280 · 30 i/s · ${sizeMb} Mo</span>
        <span>🗣️ ${escapeHtml(engine)}</span>
      `;
      setAiRenderProgress('Vidéo prête', 1, 'Vérifiez la voix et le rythme, puis téléchargez et publiez.');
      renderMp4Btn.disabled = false;
      renderMp4Btn.textContent = '🎬 Régénérer la vidéo IA';
      if (isAutomatic) {
        automaticRenderJobId = null;
        setAutoBusy(false);
        setAutoStatus('success', 'Création terminée 🎉', 'La vidéo MP4 avec voix off, musique, animation et sous-titres est prête à télécharger.');
        autoVideoFollow.href = status.video.url;
        autoVideoFollow.setAttribute('download', status.video.filename);
        autoVideoFollow.textContent = '⬇️ Télécharger la vidéo MP4';
      }
      showToast('Vidéo MP4 prête 🎉');
    }
  } catch (error) {
    if (activeRenderJobId !== jobId) return;
    clearInterval(renderPollTimer);
    renderPollTimer = null;
    setAiRenderProgress('Rendu interrompu', 0, error.message);
    renderMp4Btn.disabled = false;
    renderMp4Btn.textContent = '🎬 Réessayer le rendu IA';
    if (isAutomatic) {
      automaticRenderJobId = null;
      setAutoBusy(false);
      setAutoStatus('error', 'Suivi de la vidéo interrompu', error.message || 'Reconnectez-vous puis relancez le rendu.');
    }
  }
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
  const timeline = fallbackTimeline(currentProject);
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
      drawStudioFrame(ctx, { project: currentProject, timeline, elapsedSeconds: elapsed / 1000, width: canvas.width, height: canvas.height });
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

autoForm.addEventListener('submit', createAutomatically);
autoPrompt.addEventListener('input', () => {
  autoPromptCounter.textContent = `${autoPrompt.value.length} / 1500`;
});
autoForm.addEventListener('click', event => {
  const example = event.target.closest('[data-auto-example]');
  if (!example) return;
  autoPrompt.value = example.dataset.autoExample || '';
  autoPromptCounter.textContent = `${autoPrompt.value.length} / 1500`;
  const outputChoice = autoForm.elements.namedItem('autoOutput');
  if (outputChoice && example.dataset.autoOutput) outputChoice.value = example.dataset.autoOutput;
  autoPrompt.focus();
});
autoPosterDownload.addEventListener('click', () => triggerAutomaticPosterDownload({ notify: true }));
form.addEventListener('submit', generateProject);
renderMp4Btn.addEventListener('click', startAiRender);
posterStoryBtn.addEventListener('click', () => downloadPoster('story'));
posterSquareBtn.addEventListener('click', () => downloadPoster('square'));

// État du moteur texte (LLM local optionnel) affiché sous le formulaire.
async function refreshLlmStatusLine() {
  if (!currentUser) return;
  try {
    const status = await requestJson('/api/llm-status');
    llmStatusLine.textContent = status.available
      ? `✍️ Moteur texte : LLM local détecté — ${status.provider} (${status.model}). Hooks originaux à chaque génération.`
      : '✍️ Moteur texte : templates déterministes (hors-ligne). Pour des hooks originaux, branchez un LLM local — voir docs/llm-local.md.';
  } catch {
    llmStatusLine.textContent = '✍️ Moteur texte : templates déterministes (hors-ligne).';
  }
}

async function refreshVoiceStatusLine() {
  try {
    const { voices = [] } = await requestJson('/api/voices');
    const unavailable = voices.filter(voice => !voice.ready);
    const fallback = voices.filter(voice => voice.engine !== 'piper' && voice.ready);
    voiceStatusLine.classList.toggle('warning', unavailable.length > 0 || fallback.length > 0);
    if (unavailable.length) {
      voiceStatusLine.textContent = '❌ Voix serveur indisponible. Exécutez npm run setup:voices avant de lancer un rendu.';
    } else if (fallback.length) {
      voiceStatusLine.textContent = `⚠️ Voix de secours espeak active (${fallback.map(voice => voice.language).join(', ')}). Pour une voix neuronale, exécutez npm run setup:voices.`;
    } else {
      voiceStatusLine.textContent = '🗣️ Voix neuronales Piper prêtes et vérifiées pour le français, la darija et l’arabe.';
    }
  } catch {
    voiceStatusLine.textContent = 'Voix : diagnostic indisponible.';
    voiceStatusLine.classList.add('warning');
  }
}
viralizeBtn.addEventListener('click', viralizeProject);
playVoiceBtn.addEventListener('click', playVoiceOver);
exportJsonBtn.addEventListener('click', () => exportJson());
exportVideoBtn.addEventListener('click', exportVideoMockup);
saveProjectBtn.addEventListener('click', saveCurrentProject);
clearLibraryBtn.addEventListener('click', async () => {
  clearLibraryBtn.disabled = true;
  try {
    await requestJson('/api/projects', { method: 'DELETE' });
    libraryCache = [];
    renderLibrary();
    showToast('Votre bibliothèque a été vidée');
  } catch (error) {
    showToast(error.message || 'Suppression impossible');
  } finally {
    clearLibraryBtn.disabled = false;
  }
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

libraryList.addEventListener('click', async event => {
  const loadButton = event.target.closest('[data-load]');
  const deleteButton = event.target.closest('[data-delete]');
  const exportButton = event.target.closest('[data-export]');
  const library = getLibrary();

  if (loadButton) {
    const project = library.find(item => item.id === loadButton.dataset.load);
    if (project) renderProject(project, { toast: 'Projet ouvert' });
  }

  if (deleteButton) {
    deleteButton.disabled = true;
    try {
      await requestJson(`/api/projects/${encodeURIComponent(deleteButton.dataset.delete)}`, { method: 'DELETE' });
      libraryCache = library.filter(item => item.id !== deleteButton.dataset.delete);
      renderLibrary();
      showToast('Projet supprimé');
    } catch (error) {
      deleteButton.disabled = false;
      showToast(error.message || 'Suppression impossible');
    }
  }

  if (exportButton) {
    const project = library.find(item => item.id === exportButton.dataset.export);
    exportJson(project);
  }
});

showLoginBtn.addEventListener('click', () => setAuthMode('login'));
showRegisterBtn.addEventListener('click', () => setAuthMode('register'));
loginForm.addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(loginForm, '/api/auth/login');
});
registerForm.addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(registerForm, '/api/auth/register');
});
logoutBtn.addEventListener('click', logout);

renderLibrary();
bootstrapAuth();
