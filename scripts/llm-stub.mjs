// Serveur LLM factice — simule Ollama ET une API OpenAI-compatible.
//
// Deux usages :
//   1. Tester le branchement LLM du studio sans modèle ni GPU :
//        node scripts/llm-stub.mjs                 (port 8931)
//        YVS_LLM_BASE_URL=http://127.0.0.1:8931 YVS_LLM_API=openai npm start
//   2. Vérifier le repli sur templates quand le LLM renvoie du non-sens :
//        YVS_STUB_MODE=garbage node scripts/llm-stub.mjs
//
// Routes servies : /api/tags, /api/chat (Ollama) et /v1/models,
// /v1/chat/completions (OpenAI-compatible).

import { createServer } from 'node:http';

const port = Number(process.env.STUB_PORT || 8931);
const garbageMode = process.env.YVS_STUB_MODE === 'garbage';

const SERVICE_WORDS = {
  menage: { fr: 'femme de ménage', darija: 'femme de ménage thiqa', ar: 'عاملة منزلية' },
  nounou: { fr: 'nounou', darija: 'nounou mzyana', ar: 'جليسة أطفال' },
  autre: { fr: 'service à domicile', darija: 'service khassek', ar: 'خدمة منزلية' }
};

function sceneCountFrom(prompt) {
  const match = String(prompt).match(/scene_count"?\s*:\s*(\d+)/);
  return match ? Number(match[1]) : 6;
}

function languageFrom(prompt) {
  if (/langue"?\s*:\s*"darija/.test(prompt)) return 'darija';
  if (/langue"?\s*:\s*"ar"/.test(prompt)) return 'ar';
  return 'fr';
}

function cityFrom(prompt) {
  const match = String(prompt).match(/"ville"\s*:\s*"([^"]+)"/);
  return match ? match[1] : 'Casablanca';
}

function serviceFrom(prompt) {
  const match = String(prompt).match(/"service"\s*:\s*"([^"]+)"/);
  return match ? match[1] : 'autre';
}

function buildCreativeJson(prompt, viralBoost) {
  const language = languageFrom(prompt);
  const count = sceneCountFrom(prompt);
  const city = cityFrom(prompt);
  const words = SERVICE_WORDS[serviceFrom(prompt)] || SERVICE_WORDS.autre;
  const service = words[language] || words.fr;

  const hooksByLang = {
    fr: [
      `${viralBoost ? 'STOP. ' : ''}À ${city}, personne ne devrait chercher une ${service} plus de 24 heures.`,
      `La vérité sur la recherche d'une ${service} à ${city} (ça coûte 0 de lire).`,
      `3 erreurs qui font perdre 2 semaines quand on cherche une ${service}.`,
      `Et si votre ${service} idéale était déjà dans notre réseau à ${city} ?`,
      `Votre temps vaut plus que ça : la méthode ${city} en 30 secondes.`
    ],
    darija: [
      `${viralBoost ? 'STOP. ' : ''}F ${city}, matkhellinch qelleb 3la ${service} bo7dek.`,
      `L7a9i9a 3la qelleb ${service} f ${city} (b chassis liya).`,
      `3 ghalat kaydiro nass mnin kayqellebo 3la ${service}.`,
      `Wach ${service} dyalek deja f reseau dyalna f ${city}?`,
      `Lweqt dyalek aghla men hadchi : tari9a ${city} f 30 seconde.`
    ],
    ar: [
      `${viralBoost ? 'توقف. ' : ''}في ${city}، لا أحد يجب أن يبحث عن ${service} أكثر من 24 ساعة.`,
      `الحقيقة حول البحث عن ${service} في ${city}.`,
      `3 أخطاء تضيع أسبوعين عند البحث عن ${service}.`,
      `ماذا لو كان ${service} المثالي في شبكتنا بـ${city}؟`,
      `وقتك أثمن من ذلك: طريقة ${city} في 30 ثانية.`
    ]
  };

  const sceneTexts = {
    fr: i => ({
      onScreenText: `Étape ${i + 1} : dites-nous votre besoin en ${service}.`,
      voice: `Étape ${i + 1} : vous décrivez simplement votre besoin de ${service} à ${city}.`
    }),
    darija: i => ({
      onScreenText: `Khtwa ${i + 1} : goul lina chno khassek f ${service}.`,
      voice: `Khtwa ${i + 1} : kat-goul lina hadchi li khassek f ${city}.`
    }),
    ar: i => ({
      onScreenText: `الخطوة ${i + 1} : أخبرنا بما تحتاجه.`,
      voice: `الخطوة ${i + 1} : تصف لنا احتياجك في ${city}.`
    })
  };

  const ctaTexts = {
    fr: { onScreenText: `WhatsApp +212 691733585 · réponse rapide à ${city}.`, voice: `Écrivez « YALLAH » sur WhatsApp au +212 691733585, on vous répond vite à ${city}.` },
    darija: { onScreenText: `WhatsApp +212 691733585 · jawab serian f ${city}.`, voice: `Sift « YALLAH » f WhatsApp +212 691733585 w ghadi njawbouk daba f ${city}.` },
    ar: { onScreenText: `واتساب +212 691733585 · رد سريع في ${city}.`, voice: `أرسل « يلاه » على واتساب +212 691733585 وسنجيبك سريعا في ${city}.` }
  };

  const captionByLang = {
    fr: `Besoin d'une ${service} à ${city} ? Écrivez « YALLAH » sur WhatsApp +212 691733585.\nSuivez-nous : TikTok @yallah.services.m · Instagram @yallahservice`,
    darija: `Bghiti ${service} f ${city}? Sift « YALLAH » f WhatsApp +212 691733585.\nTbi3ouna : TikTok @yallah.services.m · Instagram @yallahservice`,
    ar: `تحتاج ${service} في ${city}؟ أرسل « يلاه » على واتساب +212 691733585.\nتابعونا : تيك توك @yallah.services.m · إنستغرام @yallahservice`
  };

  return {
    hooks: hooksByLang[language],
    scenes: [
      ...Array.from({ length: Math.max(0, count - 1) }, (_, index) => sceneTexts[language](index)),
      ctaTexts[language]
    ],
    caption: captionByLang[language],
    hashtags: ['#YallahServices', `#${city.replace(/[^\\p{L}\\p{N}]/gu, '')}`, '#ServiceRapide', '#Maroc', '#AstuceMaison', '#SansStress', '#EquipeLocale', '#SuiviSerieux', '#ReponseRapide', '#TesteMaintenant']
  };
}

function readBody(request) {
  return new Promise(resolve => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => resolve(body));
  });
}

const server = createServer(async (request, response) => {
  const url = request.url || '';
  const sendJson = (payload, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
  };

  if (request.method === 'GET' && url.startsWith('/api/tags')) {
    return sendJson({ models: [{ name: 'stub-llm:latest' }] });
  }
  if (request.method === 'GET' && url.startsWith('/v1/models')) {
    return sendJson({ data: [{ id: 'stub-llm' }] });
  }

  const body = await readBody(request);
  if (request.method === 'POST' && (url.startsWith('/api/chat') || url.startsWith('/v1/chat/completions') || url.startsWith('/chat/completions'))) {
    if (garbageMode) {
      console.log('[stub] mode garbage : réponse inutilisable');
      const text = 'Désolé, je ne peux pas répondre en JSON. Voici une longue liste de conseils…';
      return url.startsWith('/api/chat')
        ? sendJson({ message: { content: text } })
        : sendJson({ choices: [{ message: { content: text } }] });
    }
    let prompt = '';
    try {
      const parsed = JSON.parse(body);
      prompt = (parsed.messages || []).map(message => message.content).join('\n');
    } catch {
      prompt = body;
    }
    const viralBoost = /STOP|pattern interrupt|plus virale/.test(prompt);
    const creative = buildCreativeJson(prompt, viralBoost);
    const content = JSON.stringify(creative);
    console.log(`[stub] créatif généré (${creative.scenes.length} scènes, ${creative.hooks.length} hooks)`);
    return url.startsWith('/api/chat')
      ? sendJson({ message: { content } })
      : sendJson({ choices: [{ message: { content } }] });
  }

  sendJson({ error: 'route inconnue du stub' }, 404);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[stub] LLM factice sur http://127.0.0.1:${port}${garbageMode ? ' (mode garbage)' : ''}`);
});
