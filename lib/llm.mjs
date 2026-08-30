// Branchement LLM local — couche « textes originaux » du studio.
//
// Le studio reste 100 % open source et hors-ligne : le LLM est OPTIONNEL.
// Aucun service payant, aucune clé requise : on parle uniquement à des
// serveurs locaux compatibles :
//   - Ollama       (http://127.0.0.1:11434)  → API native /api/chat
//   - LM Studio    (http://127.0.0.1:1234/v1) → API OpenAI-compatible
//   - llama.cpp server, llamafile, vLLM, GGUF-anywhere
//     → YVS_LLM_BASE_URL + YVS_LLM_API=openai|ollama (+ YVS_LLM_MODEL)
//
// Si aucun serveur n'est détecté (ou si la réponse est inutilisable),
// generateCreativeLayer() renvoie null et le générateur retombe sur ses
// templates — le studio continue de fonctionner exactement comme avant.
//
// Contraintes de sécurité appliquées côté serveur (jamais au LLM seul) :
// coordonnées officielles imposées dans la scène CTA, pas de promesse de
// viralité, longueurs bornées, hashtags normalisés.

import { YALLAH_CONTACT } from './generator.mjs';

const OLLAMA_URL = process.env.YVS_OLLAMA_URL || 'http://127.0.0.1:11434';
const LMSTUDIO_URL = process.env.YVS_LMSTUDIO_URL || 'http://127.0.0.1:1234/v1';

// Séquences de rôles identiques à lib/generator.mjs (durée → scènes).
const ROLE_PLANS = {
  4: ['hook', 'problem', 'solution', 'cta'],
  6: ['hook', 'problem', 'solution', 'proof', 'details', 'cta'],
  8: ['hook', 'problem', 'objection', 'solution', 'details', 'proof', 'recap', 'cta']
};

const LANGUAGE_LABELS = {
  fr: 'français',
  darija: 'darija marocaine transcrite en lettres latines (jamais en script arabe)',
  ar: 'arabe standard en script arabe'
};

const STYLE_HINTS = {
  viral: 'accroche très directe, phrases courtes, énergie forte',
  luxe: 'ton premium, élégant, vocabulaire soigné',
  commercial: 'bénéfices concrets, démonstration claire',
  emotion: 'storytelling humain et chaleureux',
  urgent: 'urgence positive, action immédiate',
  storytelling: 'mini-histoire problème → résolution'
};

export function llmConfig() {
  let baseUrl = process.env.YVS_LLM_BASE_URL || null;
  const api = (process.env.YVS_LLM_API || (baseUrl && baseUrl.includes(':11434') ? 'ollama' : 'openai')).toLowerCase();
  // Normalisation : une base OpenAI-compatible se termine par /v1 (convention SDK OpenAI).
  if (baseUrl && api === 'openai' && !/\/v\d+$/.test(baseUrl)) {
    baseUrl = `${baseUrl.replace(/\/$/, '')}/v1`;
  }
  return {
    baseUrl,
    api: api === 'ollama' ? 'ollama' : 'openai',
    model: process.env.YVS_LLM_MODEL || null,
    apiKey: process.env.YVS_LLM_API_KEY || '',
    timeoutMs: Number(process.env.YVS_LLM_TIMEOUT_MS) || 75_000,
    explicit: Boolean(baseUrl)
  };
}

async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(candidate) {
  if (candidate.api === 'ollama') {
    const data = await fetchJson(`${candidate.baseUrl}/api/tags`, { timeoutMs: 1800 });
    return (data?.models || []).map(model => model.name).filter(Boolean);
  }
  const data = await fetchJson(`${candidate.baseUrl}/models`, { timeoutMs: 1800 });
  return (data?.data || []).map(model => model.id).filter(Boolean);
}

let cachedStatus = null;

// Détecte un serveur LLM local. Cache 10 s pour ne pas marteler les ports.
export async function detectLlm({ force = false } = {}) {
  if (!force && cachedStatus && Date.now() - cachedStatus.checkedAt < 10_000) {
    return cachedStatus;
  }
  const config = llmConfig();
  const candidates = [];
  if (config.baseUrl) {
    candidates.push({ baseUrl: config.baseUrl, api: config.api, label: config.baseUrl.includes(':11434') ? 'Ollama' : 'endpoint local' });
  }
  candidates.push({ baseUrl: OLLAMA_URL, api: 'ollama', label: 'Ollama' });
  candidates.push({ baseUrl: LMSTUDIO_URL, api: 'openai', label: 'LM Studio' });

  for (const candidate of candidates) {
    try {
      const models = await listModels(candidate);
      if (models.length) {
        cachedStatus = {
          available: true,
          provider: candidate.label,
          api: candidate.api,
          baseUrl: candidate.baseUrl,
          model: config.model && models.includes(config.model) ? config.model : models[0],
          models,
          checkedAt: Date.now()
        };
        return cachedStatus;
      }
    } catch {
      // serveur absent : candidat suivant
    }
  }
  cachedStatus = { available: false, checkedAt: Date.now() };
  return cachedStatus;
}

export function getCachedLlmStatus() {
  return cachedStatus || { available: false, checkedAt: 0 };
}

function sceneCountFor(duration) {
  return Number(duration) === 15 ? 4 : Number(duration) === 60 ? 8 : 6;
}

function buildPrompt(input, { viralBoost = false, previousHooks = [] } = {}) {
  const sceneCount = sceneCountFor(input.duration);
  const roles = ROLE_PLANS[sceneCount];
  const language = LANGUAGE_LABELS[input.language] || LANGUAGE_LABELS.fr;
  const serviceLabels = {
    menage: 'femme de ménage', nounou: 'nounou / garde d\u2019enfants', auxiliaire: 'auxiliaire de vie',
    cuisiniere: 'cuisinière à domicile', airbnb: 'grand ménage Airbnb', emploi: 'offre d\u2019emploi',
    yallah: 'services Yallah Services (généraliste)', autre: 'service personnalisé'
  };
  const brief = {
    objectif: input.objective,
    ville: input.city,
    service: serviceLabels[input.service] || input.service,
    audience: input.audience,
    style: input.style,
    direction_creative: input.creativeDirection || '',
    effets_visuels: Array.isArray(input.effects) ? input.effects : [],
    langue: language,
    duree_cible_s: input.duration,
    scene_count: sceneCount,
    roles_dans_l_ordre: roles,
    whatsapp_officiel: input.whatsapp || YALLAH_CONTACT.gsm,
    ville_hashtag: input.city
  };

  const rules = [
    `Tu es directeur créatif pour Yallah Services, une société marocaine de services à domicile (${YALLAH_CONTACT.gsm}, ${YALLAH_CONTACT.email}).`,
    `Rédige les textes d'une vidéo courte TikTok/Reels en ${language}.`,
    `Style demandé : ${STYLE_HINTS[input.style] || STYLE_HINTS.viral}.`,
    input.creativeDirection ? `Direction créative à respecter : ${input.creativeDirection}` : '',
    viralBoost
      ? 'Version « plus virale » : pattern interrupt fort dès le premier mot (ex. « STOP. »), contraste problème/solution, tension positive, mais AUCUNE promesse de résultat garanti.'
      : 'Ton honnête et concret : aucune promesse de viralité ni de résultat garanti.',
    'Le service, la ville et le bénéfice doivent être évidents en 2 secondes.',
    `La dernière scène (rôle cta) DOIT mentionner le numéro WhatsApp ${brief.whatsapp_officiel} et la ville ${brief.ville}.`,
    'Textes écran : 40 à 110 caractères, sans emoji. Voix off : 60 à 150 caractères par scène, naturelle, parlée.',
    'Hooks : 5 variantes courtes (max ~120 caractères) à tester en A/B, chacune différente (question, chiffre, objection, curiosité, bénéfice).',
    `Caption : 1 paragraphe appelant à écrire sur WhatsApp ${brief.whatsapp_officiel}, puis une ligne « Suivez-nous : TikTok ${YALLAH_CONTACT.tiktok.handle} · Instagram ${YALLAH_CONTACT.instagram.handle} ».`,
    'Hashtags : 10 à 12, commençant par #, sans espaces, dont #YallahServices en premier, la ville en second.',
    previousHooks.length ? 'Anciens hooks à dépasser (sois plus percutant mais restons honnête) : ' + JSON.stringify(previousHooks) : '',
    'RÉPONSE : UNIQUEMENT le JSON brut ci-dessous, sans texte avant/après, sans balise code :',
    '{"hooks":["...","...","...","...","..."],"scenes":[{"onScreenText":"...","voice":"..."}, … x scene_count dans l ordre des rôles],"caption":"...","hashtags":["#…"]}'
  ].filter(Boolean);

  return {
    system: rules.join('\n'),
    user: `BRIEF_JSON:\n${JSON.stringify(brief, null, 2)}`
  };
}

function extractJsonBlock(raw) {
  const text = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Valide la couche créative renvoyée par le LLM. Retourne un objet propre
// ou null si rien d'exploitable (le générateur gardera ses templates).
export function validateCreativeLayer(parsed, input) {
  if (!parsed || typeof parsed !== 'object') return null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const validText = (value, max) => {
    const text = clean(value);
    return text && text.length >= 8 && text.length <= max ? text : null;
  };

  const hooks = Array.isArray(parsed.hooks)
    ? parsed.hooks.map(hook => validText(hook, 180)).filter(Boolean).slice(0, 5)
    : [];

  const sceneCount = sceneCountFor(input.duration);
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const usableScenes = scenes
    .slice(0, sceneCount)
    .map(scene => ({
      onScreenText: validText(scene?.onScreenText, 130),
      voice: validText(scene?.voice, 240)
    }))
    .filter(scene => scene.onScreenText || scene.voice);

  const caption = validText(parsed.caption, 700);
  const hashtags = (Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
    .map(tag => {
      const raw = clean(tag).replace(/^#+/, '#').replace(/\s+/g, '');
      return /^#[\p{L}\p{N}_]{2,29}$/u.test(raw) ? raw : null;
    })
    .filter(Boolean);

  const enough = (hooks.length >= 3 ? 1 : 0) + (usableScenes.length >= Math.ceil(sceneCount / 2) ? 1 : 0);
  if (enough === 0) return null;

  return { hooks, scenes: usableScenes, caption, hashtags };
}

async function chat(candidate, { system, user, temperature, maxTokens, timeoutMs }) {
  if (candidate.api === 'ollama') {
    const data = await fetchJson(`${candidate.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: candidate.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: false,
        format: 'json',
        options: { temperature, num_predict: maxTokens }
      }),
      timeoutMs
    });
    return data?.message?.content || '';
  }
  const headers = { 'Content-Type': 'application/json' };
  if (candidate.apiKey) headers.Authorization = `Bearer ${candidate.apiKey}`;
  const data = await fetchJson(`${candidate.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: candidate.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      max_tokens: maxTokens
    }),
    timeoutMs
  });
  return data?.choices?.[0]?.message?.content || '';
}

// Point d'entrée : tente une génération créative par LLM local.
// → { creative, provider, model } si succès, null sinon (jamais d'exception).
export async function generateCreativeLayer(rawInput, { viralBoost = false, previousHooks = [] } = {}) {
  const input = rawInput || {};
  try {
    const status = await detectLlm();
    if (!status.available) return null;

    const prompt = buildPrompt(
      { ...input, duration: Number(input.duration) === 60 ? 60 : Number(input.duration) === 15 ? 15 : 30 },
      { viralBoost, previousHooks }
    );
    const raw = await chat(
      { api: status.api, baseUrl: status.baseUrl, model: status.model, apiKey: llmConfig().apiKey },
      { system: prompt.system, user: prompt.user, temperature: 0.9, maxTokens: 1400, timeoutMs: llmConfig().timeoutMs }
    );
    const creative = validateCreativeLayer(extractJsonBlock(raw), input);
    if (!creative) return null;

    return { creative, provider: status.provider, model: status.model };
  } catch (error) {
    console.warn(`[llm] génération créative ignorée : ${error.message}`);
    return null;
  }
}
