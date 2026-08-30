// Interprétation déterministe d'une demande libre pour le mode « Création automatique ».
//
// Ce module ne dépend d'aucun service distant : il transforme une phrase en
// brief sûr et borné pour lib/generator.mjs. Le texte original est néanmoins
// conservé dans l'objectif et la direction créative afin qu'un LLM local
// optionnel puisse enrichir les formulations sans devenir indispensable.

const OUTPUTS = new Set(['poster', 'video', 'both']);
const DURATIONS = [15, 30, 60];

const SERVICE_RULES = [
  {
    code: 'emploi',
    label: "Offre d'emploi",
    terms: [
      'offre emploi', "offre d'emploi", 'recrutement', 'recruter', 'recrute',
      'candidature', 'candidate', 'job', 'emploi', 'travaillez avec nous',
      'khdma', 'خدمة عمل', 'فرصة عمل', 'وظيفة', 'توظيف'
    ]
  },
  {
    code: 'airbnb',
    label: 'Grand ménage Airbnb',
    terms: [
      'airbnb', 'location courte duree', 'location saisonniere', 'turnover',
      'grand menage', 'nettoyage profond', 'deep clean', 'شقة اير بي ان بي',
      'تنظيف الشقق', 'تنظيف عميق'
    ]
  },
  {
    code: 'auxiliaire',
    label: 'Auxiliaire de vie',
    terms: [
      'auxiliaire', 'aide de vie', 'aide a domicile', 'garde malade',
      'personne agee', 'personnes agees', 'senior', 'dependant', 'dependante',
      'مساعدة منزلية للمسنين', 'مساعدة رعاية', 'رعاية المسنين', 'مريض'
    ]
  },
  {
    code: 'nounou',
    label: 'Nounou',
    terms: [
      'nounou', 'baby sitter', 'babysitter', 'baby-sitter', "garde d'enfant",
      "garde d'enfants", 'garde enfants', 'جليسة أطفال',
      'مربية أطفال', 'حاضنة أطفال'
    ]
  },
  {
    code: 'cuisiniere',
    label: 'Cuisinière à domicile',
    terms: [
      'cuisiniere', 'cuisinier a domicile', 'cuisine a domicile', 'repas maison',
      'meal prep', 'tayaba', 'طبخ منزلي', 'طباخة', 'طباخ منزلي'
    ]
  },
  {
    code: 'menage',
    label: 'Femme de ménage',
    terms: [
      'femme de menage', 'agent de menage', 'aide menagere', 'menage',
      'nettoyage maison', 'nettoyage domicile', 'nettoyage', 'دار نقية',
      'عاملة منزل', 'عاملة نظافة', 'تنظيف المنزل'
    ]
  },
  {
    code: 'yallah',
    label: 'Services Yallah Services',
    terms: [
      'tous les services', 'services yallah', 'yallah services', 'service maison',
      'services a domicile', 'خدمات يلاه', 'جميع الخدمات', 'خدمات منزلية'
    ]
  }
];

const CITY_RULES = [
  ['Casablanca', ['casablanca', 'casa', 'الدار البيضاء', 'كازابلانكا', 'كازا']],
  ['Rabat', ['rabat', 'الرباط']],
  ['Marrakech', ['marrakech', 'marrakesh', 'مراكش']],
  ['Tanger', ['tanger', 'tangier', 'طنجة']],
  ['Agadir', ['agadir', 'أكادير', 'اكادير']],
  ['Fès', ['fes', 'fez', 'فاس']],
  ['Meknès', ['meknes', 'مكناس']],
  ['Oujda', ['oujda', 'وجدة']],
  ['Tétouan', ['tetouan', 'تطوان']],
  ['Kénitra', ['kenitra', 'القنيطرة']],
  ['Mohammédia', ['mohammedia', 'المحمدية']],
  ['El Jadida', ['el jadida', 'الجديدة']],
  ['Salé', ['sale', 'سلا']],
  ['Témara', ['temara', 'تمارة']],
  ['Bouskoura', ['bouskoura', 'بوسكورة']],
  ['Berrechid', ['berrechid', 'برشيد']],
  ['Settat', ['settat', 'سطات']],
  ['Safi', ['safi', 'آسفي', 'اسفي']],
  ['Essaouira', ['essaouira', 'الصويرة']],
  ['Nador', ['nador', 'الناظور']],
  ['Al Hoceïma', ['al hoceima', 'الحسيمة']],
  ['Ifrane', ['ifrane', 'إفران', 'افران']],
  ['Béni Mellal', ['beni mellal', 'بني ملال']],
  ['Khouribga', ['khouribga', 'خريبكة']],
  ['Taza', ['taza', 'تازة']],
  ['Laâyoune', ['laayoune', 'laayoun', 'العيون']],
  ['Dakhla', ['dakhla', 'الداخلة']]
];

const STYLE_RULES = [
  {
    code: 'urgent',
    label: 'Urgent',
    direction: 'rythme pressé, compte à rebours et appel à agir immédiatement',
    terms: ['urgent', 'urgence', 'aujourd hui', 'immediat', 'rapidement', 'derniere minute', 'دابا', 'مستعجل', 'عاجل', 'بسرعة']
  },
  {
    code: 'luxe',
    label: 'Luxe',
    direction: 'ambiance premium, mouvements doux, lumière élégante et détails dorés',
    terms: ['luxe', 'premium', 'haut de gamme', 'elegant', 'chic', 'dore', 'prestige', 'فخم', 'راقية', 'ذهبي']
  },
  {
    code: 'emotion',
    label: 'Émotion',
    direction: 'ambiance humaine, chaleureuse et rassurante',
    terms: ['emotion', 'emouvant', 'touchant', 'chaleureux', 'famille heureuse', 'rassurant', 'حنون', 'عاطفي', 'دافئ']
  },
  {
    code: 'commercial',
    label: 'Commercial',
    direction: 'démonstration professionnelle, bénéfices clairs et CTA direct',
    terms: ['commercial', 'professionnel', 'corporate', 'demonstration', 'sobre', 'entreprise', 'احترافي', 'تجاري']
  },
  {
    code: 'viral',
    label: 'Viral',
    direction: 'montage dynamique, accroche immédiate, zooms et transitions rapides',
    terms: ['viral', 'tendance', 'trend', 'dynamique', 'energetique', 'rythme rapide', 'ترند', 'فيرال', 'حماسي']
  },
  {
    code: 'storytelling',
    label: 'Storytelling',
    direction: 'mini-histoire cinématique avec problème, transformation et résultat',
    terms: ['storytelling', 'histoire', 'cinematique', 'cinema', 'avant apres', 'transformation', 'قصة', 'سينمائي', 'قبل وبعد']
  }
];

const EFFECT_RULES = [
  ['Zoom dynamique', ['zoom', 'ken burns', 'rapprochement']],
  ['Transitions rapides', ['transition rapide', 'transitions rapides', 'jump cut', 'flash', 'cut rapide']],
  ['Avant / après', ['avant apres', 'before after', 'قبل وبعد']],
  ['Compte à rebours', ['compte a rebours', 'countdown', 'عد تنازلي']],
  ['Lumière dorée', ['lumiere doree', 'reflets dores', 'golden', 'ذهبي']],
  ['Cinématique', ['cinematique', 'cinema', 'سينمائي']],
  ['Minimaliste', ['minimaliste', 'epure', 'clean', 'بسيط']],
  ['Texte animé', ['texte anime', 'titres animes', 'typographie dynamique', 'كلام متحرك']],
  ['Mouvement doux', ['mouvement doux', 'ralenti', 'slow motion', 'هادئ']],
  ['Énergique', ['energetique', 'rythme rapide', 'tres dynamique', 'حماسي']],
  ['Transformation visuelle', ['transformation', 'metamorphose', 'reveal', 'كشف']]
];

const AUDIENCE_RULES = [
  ['propriétaires et hôtes Airbnb', ['proprietaire airbnb', 'hote airbnb', 'location courte duree', 'مول الشقة']],
  ['parents actifs', ['parents', 'maman', 'papa', 'jeunes parents', 'الآباء', 'الامهات', 'الأمهات']],
  ['familles avec un proche âgé ou fragile', ['personne agee', 'senior', 'proche age', 'malade', 'المسنين', 'مريض']],
  ['candidates à la recherche d’un emploi', ['candidate', 'candidature', 'cherche un emploi', 'cherche du travail', 'باحثات عن عمل']],
  ['familles actives', ['famille', 'foyer', 'couple', 'maison', 'العائلات', 'الاسر', 'الأسر']],
  ['professionnels et entreprises', ['entreprise', 'professionnel', 'bureau', 'societe', 'الشركات']]
];

const DEFAULT_AUDIENCE = {
  menage: 'familles actives, jeunes couples et propriétaires Airbnb',
  nounou: 'parents actifs',
  auxiliaire: 'familles avec un proche âgé ou fragile',
  cuisiniere: 'familles occupées',
  airbnb: 'hôtes Airbnb et propriétaires de locations courte durée',
  emploi: 'candidates qualifiées et motivées',
  yallah: 'foyers urbains au Maroc',
  autre: 'clients qui veulent gagner du temps'
};

const LANGUAGE_LABELS = {
  fr: 'Français',
  darija: 'Darija marocaine',
  ar: 'Arabe'
};

const OUTPUT_LABELS = {
  poster: 'Affiche PNG',
  video: 'Vidéo MP4',
  both: 'Affiche PNG + vidéo MP4'
};

function cleanText(value, maxLength = 1_500) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeSearch(value) {
  return cleanText(value)
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[-_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}'+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(normalized, rawTerm) {
  const term = normalizeSearch(rawTerm);
  if (!term) return false;
  const boundary = `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`;
  return new RegExp(boundary, 'u').test(normalized);
}

function matchingRule(normalized, rules) {
  return rules.find(rule => rule.terms.some(term => containsTerm(normalized, term))) || null;
}

function detectCity(normalized) {
  for (const [label, aliases] of CITY_RULES) {
    if (aliases.some(alias => containsTerm(normalized, alias))) return { value: label, detected: true };
  }
  return { value: 'Casablanca', detected: false };
}

function nearestDuration(value) {
  return DURATIONS.reduce((best, duration) => (
    Math.abs(duration - value) < Math.abs(best - value) ? duration : best
  ), DURATIONS[0]);
}

function detectDuration(normalized) {
  const secondsMatch = normalized.match(/(?:^|\s)(\d{1,3})\s*(?:s|sec|seconde|secondes|ثانية|ثواني?)(?=$|\s)/u);
  if (secondsMatch) {
    const requested = Math.max(1, Math.min(120, Number(secondsMatch[1])));
    return { value: nearestDuration(requested), requested, detected: true };
  }
  const minutesMatch = normalized.match(/(?:^|\s)(\d{1,2})\s*(?:min|minute|minutes|دقيقة|دقائق)(?=$|\s)/u);
  if (minutesMatch) {
    const requested = Math.max(1, Math.min(120, Number(minutesMatch[1]) * 60));
    return { value: nearestDuration(requested), requested, detected: true };
  }
  if ([
    'video tres courte', 'video courte', 'format court', 'spot court', '15 secondes',
    'قصير', 'قصيرة'
  ].some(term => containsTerm(normalized, term))) {
    return { value: 15, requested: null, detected: true };
  }
  if ([
    'video longue', 'version detaillee', 'une minute', '60 secondes', 'مطول', 'مفصل'
  ].some(term => containsTerm(normalized, term))) {
    return { value: 60, requested: null, detected: true };
  }
  return { value: 30, requested: null, detected: false };
}

function detectLanguage(normalized, request) {
  const explicit = [
    ['darija', ['darija', 'derija', 'marocain parle', 'بالدارجة', 'الدارجة المغربية']],
    ['fr', ['en francais', 'francais', 'بالفرنسية']],
    ['ar', ['en arabe', 'langue arabe', 'arabe classique', 'بالعربية', 'العربية الفصحى']]
  ];
  for (const [code, terms] of explicit) {
    if (terms.some(term => containsTerm(normalized, term))) return { value: code, detected: true };
  }

  const darijaMarkers = ['bghit', 'khasni', 'dyal', 'daba', 'm3a', '3la', 'wa7ed', 'thiqa', 'kayna', 'sift'];
  const markerCount = darijaMarkers.filter(term => containsTerm(normalized, term)).length;
  if (markerCount >= 2) return { value: 'darija', detected: true };

  const letters = [...request].filter(char => /\p{L}/u.test(char));
  const arabicLetters = letters.filter(char => /[\u0600-\u06FF]/u.test(char));
  if (letters.length && arabicLetters.length / letters.length >= 0.35) {
    return { value: 'ar', detected: true };
  }
  return { value: 'fr', detected: false };
}

function detectOutput(normalized, selectedOutput) {
  if (OUTPUTS.has(selectedOutput)) return { value: selectedOutput, detected: true, source: 'selection' };

  const posterMentioned = ['affiche', 'poster', 'flyer', 'image publicitaire', 'تصميم', 'ملصق', 'صورة'].some(term => containsTerm(normalized, term));
  const videoMentioned = ['video', 'mp4', 'reel', 'tiktok', 'spot anime', 'فيديو', 'ريلز'].some(term => containsTerm(normalized, term));
  const bothMentioned = ['les deux', 'affiche et video', 'poster et video', 'الصورة والفيديو'].some(term => containsTerm(normalized, term));
  if (bothMentioned || (posterMentioned && videoMentioned)) return { value: 'both', detected: true, source: 'request' };
  if (videoMentioned) return { value: 'video', detected: true, source: 'request' };
  if (posterMentioned) return { value: 'poster', detected: true, source: 'request' };
  return { value: 'both', detected: false, source: 'default' };
}

function detectPosterFormat(normalized) {
  if (['carre', 'carree', 'format carre', 'square', '1080 1080', 'post instagram', 'مربع'].some(term => containsTerm(normalized, term))) {
    return { value: 'square', label: 'Carré 1080×1080', detected: true };
  }
  if (['story', 'statut whatsapp', 'status whatsapp', 'vertical', '9 16', 'ستوري', 'عمودي'].some(term => containsTerm(normalized, term))) {
    return { value: 'story', label: 'Story 1080×1920', detected: true };
  }
  return { value: 'story', label: 'Story 1080×1920', detected: false };
}

function detectVideoMode(normalized) {
  const animatedPoster = [
    'affiche animee', 'animer affiche', 'poster anime', 'video affiche',
    'تحريك الملصق', 'صورة متحركة'
  ].some(term => containsTerm(normalized, term));
  return animatedPoster ? 'poster' : 'scenario';
}

function extractEffects(normalized, request, styleRule) {
  const effects = [];
  for (const [label, terms] of EFFECT_RULES) {
    if (terms.some(term => containsTerm(normalized, term))) effects.push(label);
  }

  // Conserve aussi une direction libre après « effet / ambiance / style » :
  // cela permet au LLM local et aux futurs moteurs visuels de comprendre une
  // formulation que le vocabulaire déterministe ne connaît pas encore.
  const customMatch = request.match(/(?:effet|ambiance|look|style|transition(?:s)?)[\s:=-]+([^.!?\n]{3,100})/iu);
  const custom = customMatch
    ? cleanText(customMatch[1], 100).replace(/\s+(?:pour|afin de|avec une video|avec un poster)\b.*$/iu, '').trim()
    : '';
  if (custom && !effects.some(effect => normalizeSearch(custom).includes(normalizeSearch(effect)))) {
    effects.push(custom.charAt(0).toLocaleUpperCase('fr') + custom.slice(1));
  }

  if (!effects.length) effects.push(styleRule.direction);
  return effects.slice(0, 6);
}

function detectAudience(normalized, service) {
  for (const [label, terms] of AUDIENCE_RULES) {
    if (terms.some(term => containsTerm(normalized, term))) return { value: label, detected: true };
  }
  return { value: DEFAULT_AUDIENCE[service] || DEFAULT_AUDIENCE.autre, detected: false };
}

/**
 * Transforme une phrase utilisateur en brief complet pour generateStudioProject().
 *
 * @param {string} rawRequest demande libre (FR, darija latine ou arabe)
 * @param {{ output?: 'poster'|'video'|'both'|'auto' }} options
 */
export function interpretAutoRequest(rawRequest, { output = 'auto' } = {}) {
  const request = cleanText(rawRequest);
  const normalized = normalizeSearch(request);

  const serviceRule = matchingRule(normalized, SERVICE_RULES) || {
    code: 'autre', label: 'Service personnalisé'
  };
  const city = detectCity(normalized);
  const language = detectLanguage(normalized, request);
  const duration = detectDuration(normalized);
  const matchedStyle = matchingRule(normalized, STYLE_RULES);
  const styleRule = matchedStyle || STYLE_RULES.find(rule => rule.code === 'viral');
  const audience = detectAudience(normalized, serviceRule.code);
  const selectedOutput = detectOutput(normalized, output);
  const posterFormat = detectPosterFormat(normalized);
  const videoMode = detectVideoMode(normalized);
  const effects = extractEffects(normalized, request, styleRule);
  const creativeDirection = cleanText(
    `Style ${styleRule.label}. Effets et ambiance : ${effects.join(', ')}. Respecter fidèlement l'idée décrite par l'utilisateur.`,
    500
  );

  return {
    request,
    output: selectedOutput.value,
    outputLabel: OUTPUT_LABELS[selectedOutput.value],
    posterFormat: posterFormat.value,
    posterFormatLabel: posterFormat.label,
    videoMode,
    service: serviceRule.code,
    serviceLabel: serviceRule.label,
    city: city.value,
    language: language.value,
    languageLabel: LANGUAGE_LABELS[language.value],
    duration: duration.value,
    requestedDuration: duration.requested,
    style: styleRule.code,
    styleLabel: styleRule.label,
    audience: audience.value,
    effects,
    creativeDirection,
    detected: {
      service: Boolean(matchingRule(normalized, SERVICE_RULES)),
      city: city.detected,
      language: language.detected,
      duration: duration.detected,
      style: Boolean(matchedStyle),
      audience: audience.detected,
      output: selectedOutput.detected,
      posterFormat: posterFormat.detected
    },
    input: {
      objective: request,
      city: city.value,
      service: serviceRule.code,
      duration: duration.value,
      style: styleRule.code,
      language: language.value,
      audience: audience.value,
      creativeDirection,
      effects
    }
  };
}
