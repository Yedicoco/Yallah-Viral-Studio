const SERVICES = {
  menage: {
    emoji: '🧹',
    fr: 'femme de ménage',
    darija: 'femme de ménage thiqa',
    ar: 'عاملة منزل موثوقة',
    painFr: 'perdre du temps à chercher quelqu’un de fiable',
    benefitFr: 'une aide sérieuse, disponible et suivie',
    audienceFr: 'familles actives, jeunes couples et propriétaires Airbnb'
  },
  nounou: {
    emoji: '👶',
    fr: 'nounou',
    darija: 'nounou mzyana w thiqa',
    ar: 'جليسة أطفال موثوقة',
    painFr: 'confier ses enfants sans être totalement rassuré',
    benefitFr: 'une personne vérifiée, douce et ponctuelle',
    audienceFr: 'parents actifs'
  },
  auxiliaire: {
    emoji: '🤝',
    fr: 'auxiliaire de vie',
    darija: 'mosa3ida dyal lhayat',
    ar: 'مساعدة رعاية منزلية',
    painFr: 'laisser un proche âgé ou fragile sans accompagnement adapté',
    benefitFr: 'un accompagnement humain, patient et régulier',
    audienceFr: 'familles avec proches âgés ou dépendants'
  },
  cuisiniere: {
    emoji: '🍲',
    fr: 'cuisinière',
    darija: 'tayaba dyal dar',
    ar: 'طباخة منزلية',
    painFr: 'rentrer tard et devoir encore préparer les repas',
    benefitFr: 'des repas faits maison et une organisation plus légère',
    audienceFr: 'familles occupées'
  },
  airbnb: {
    emoji: '🏠',
    fr: 'grand ménage Airbnb',
    darija: 'nettoyage Airbnb b qualité',
    ar: 'تنظيف عميق لشقق Airbnb',
    painFr: 'recevoir un mauvais commentaire à cause du ménage',
    benefitFr: 'un logement propre, prêt à accueillir les prochains voyageurs',
    audienceFr: 'hôtes Airbnb et propriétaires courte durée'
  },
  emploi: {
    emoji: '💼',
    fr: "offre d'emploi",
    darija: 'khdma m3a Yallah Services',
    ar: 'فرصة عمل مع يلاه سيرفيسز',
    painFr: 'chercher un emploi sérieux sans accompagnement',
    benefitFr: 'des missions claires, un suivi et des opportunités locales',
    audienceFr: 'candidates qualifiées et motivées'
  },
  yallah: {
    emoji: '⚡',
    fr: 'Services Yallah Services',
    darija: 'Services Yallah Services',
    ar: 'خدمات يلاه سيرفيسز',
    painFr: 'jongler entre plusieurs besoins à la maison',
    benefitFr: 'une solution rapide pour trouver le bon profil',
    audienceFr: 'foyers urbains au Maroc'
  },
  autre: {
    emoji: '✨',
    fr: 'service personnalisé',
    darija: 'service khassek',
    ar: 'خدمة مخصصة',
    painFr: 'ne pas trouver rapidement la bonne personne',
    benefitFr: 'une recommandation claire et adaptée',
    audienceFr: 'clients qui veulent gagner du temps'
  }
};

const STYLE_DATA = {
  viral: {
    label: 'Viral',
    hookPrefix: 'Attendez…',
    energy: 'rythme rapide, cuts serrés, texte très lisible',
    color: '#ffbe0b',
    beat: 'afro-pop commercial, 100-115 BPM, énergique'
  },
  luxe: {
    label: 'Luxe',
    hookPrefix: 'Le service premium que votre maison attendait',
    energy: 'plans propres, mouvements doux, ambiance premium',
    color: '#d8b46a',
    beat: 'lounge chic, percussions légères, premium'
  },
  commercial: {
    label: 'Commercial',
    hookPrefix: 'Besoin d’une solution simple ?',
    energy: 'démonstration claire, bénéfices visibles, CTA direct',
    color: '#20c997',
    beat: 'corporate moderne, optimiste, tempo moyen'
  },
  emotion: {
    label: 'Émotion',
    hookPrefix: 'Quand la maison respire, toute la famille respire',
    energy: 'storytelling humain, plans chaleureux, respiration',
    color: '#f06595',
    beat: 'piano doux + beat léger, chaleureux'
  },
  urgent: {
    label: 'Urgent',
    hookPrefix: 'Besoin d’aide rapidement ?',
    energy: 'rythme pressé, compte à rebours, CTA très visible',
    color: '#ff4d4f',
    beat: 'beat court, tension positive, montée rapide'
  },
  storytelling: {
    label: 'Storytelling',
    hookPrefix: 'Voici l’histoire d’une maison qui avait besoin d’aide',
    energy: 'problème → tension → solution → résultat',
    color: '#845ef7',
    beat: 'cinématique léger, progression narrative'
  }
};

const LANGUAGE_LABELS = {
  fr: 'Français',
  darija: 'Darija marocaine',
  ar: 'Arabe'
};

const SERVICE_KEYS = Object.keys(SERVICES);
const STYLE_KEYS = Object.keys(STYLE_DATA);

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim();
}

function pickValid(value, validKeys, fallback) {
  return validKeys.includes(value) ? value : fallback;
}

function cityHashtag(city) {
  return cleanText(city || 'Maroc')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '') || 'Maroc';
}

function serviceName(service, language) {
  if (language === 'darija') return service.darija;
  if (language === 'ar') return service.ar;
  return service.fr;
}

function ctaText(input, language) {
  const whatsapp = cleanText(input.whatsapp, '+212 6 00 00 00 00');
  const city = cleanText(input.city, 'Casablanca');

  if (language === 'darija') {
    return `Sift lina message f WhatsApp daba: ${whatsapp}. Yallah Services kayn f ${city}.`;
  }
  if (language === 'ar') {
    return `راسلونا الآن على واتساب: ${whatsapp}. يلاه سيرفيسز في ${city}.`;
  }
  return `Envoyez “YALLAH” sur WhatsApp : ${whatsapp}. Yallah Services vous répond à ${city}.`;
}

function buildHooks(input, service, style, viralBoost = false) {
  const city = cleanText(input.city, 'Casablanca');
  const objective = cleanText(input.objective, `Je veux promouvoir ${service.fr} à ${city}`);
  const nameFr = service.fr;
  const nameDarija = service.darija;
  const nameAr = service.ar;

  if (input.language === 'darija') {
    const hooks = [
      `Katqelleb 3la ${nameDarija} f ${city}? Mat contacti 7ta wa7ed qbel ma tchouf hadchi.`,
      `Dar katakhod lik bzaf dyal lweqt? Yallah Services yqder y3awnek men lyom.`,
      `Ila bghiti chi wa7ed thiqa f ${city}, had video lik.`,
      `Mouchkil dyal ${nameDarija}? Hna fin kayna l7ell.`,
      `Qbel ma tkhtar chi profil, chouf kifach Yallah Services kaysehhel 3lik.`
    ];
    return viralBoost
      ? hooks.map((hook, index) => index === 0 ? `STOP. ${hook} Lkhata li kaydirou bzaf nass huwa...` : hook)
      : hooks;
  }

  if (input.language === 'ar') {
    const hooks = [
      `هل تبحث عن ${nameAr} في ${city}؟ انتظر قبل أن تتواصل مع أي شخص.`,
      `منزلك يحتاج إلى مساعدة موثوقة؟ يلاه سيرفيسز تبسط عليك الاختيار.`,
      `إذا كنت في ${city} وتريد خدمة منزلية بسرعة، شاهد هذا.`,
      `المشكلة ليست في البحث… المشكلة في إيجاد الشخص المناسب.`,
      `قبل أن تختار، اكتشف كيف تساعدك يلاه سيرفيسز.`
    ];
    return viralBoost
      ? hooks.map((hook, index) => index === 0 ? `توقف لحظة. ${hook}` : hook)
      : hooks;
  }

  const hooks = [
    `Vous cherchez une ${nameFr} fiable à ${city} ? Attendez… ne contactez personne avant de voir ça !`,
    `Le vrai problème, ce n’est pas de chercher une ${nameFr}. C’est de trouver la bonne personne.`,
    `${city} : votre maison a besoin d’aide cette semaine ? Voici la méthode simple.`,
    `Si vous voulez éviter de ${service.painFr}, cette vidéo est pour vous.`,
    `Avant de poster une annonce, regardez comment Yallah Services peut vous faire gagner du temps.`
  ];

  if (style === 'luxe') {
    hooks[0] = `Et si votre maison à ${city} avait enfin un service à la hauteur de vos exigences ?`;
  }

  if (style === 'emotion') {
    hooks[0] = `Une maison apaisée, c’est parfois juste la bonne aide au bon moment.`;
  }

  if (style === 'urgent') {
    hooks[0] = `Besoin d’une ${nameFr} à ${city} rapidement ? Voici quoi faire maintenant.`;
  }

  if (viralBoost) {
    hooks[0] = `STOP. Vous cherchez une ${nameFr} fiable à ${city} ? Ne faites pas cette erreur avant de contacter quelqu’un.`;
    hooks[1] = `99% des demandes échouent pour la même raison : le profil n’est pas vérifié. Voici la solution.`;
  }

  if (objective.length > 15) {
    hooks[4] = `Objectif : ${objective}. Version courte, claire et actionnable en quelques secondes.`;
  }

  return hooks;
}

function sentenceByLanguage(language, fr, darija, ar) {
  if (language === 'darija') return darija;
  if (language === 'ar') return ar;
  return fr;
}

function buildSceneTemplates(input, service, styleData, hooks, viralBoost) {
  const city = cleanText(input.city, 'Casablanca');
  const serviceLocalized = serviceName(service, input.language);
  const cta = ctaText(input, input.language);
  const objective = cleanText(input.objective, `Promouvoir ${service.fr} à ${city}`);
  const durations = Number(input.duration) === 60 ? [6, 7, 8, 8, 8, 8, 7, 8]
    : Number(input.duration) === 30 ? [4, 5, 5, 5, 5, 6]
      : [3, 4, 4, 4];

  const scenePool = [
    {
      role: 'hook',
      visual: sentenceByLanguage(input.language,
        `Plan vertical très rapproché : téléphone avec message “Besoin de ${service.fr} à ${city} ?”`,
        `Plan 9:16 dyal téléphone fih message “Bghiti ${service.darija} f ${city}?”`,
        `لقطة عمودية لهاتف تظهر رسالة طلب ${service.ar} في ${city}`),
      overlay: hooks[0],
      voice: hooks[0],
      transition: viralBoost ? 'jump cut + zoom rapide' : 'zoom léger',
      emoji: service.emoji
    },
    {
      role: 'problem',
      visual: sentenceByLanguage(input.language,
        `Maison active, planning chargé, notifications et liste de tâches`,
        `Dar m3emra b tâches, notifications, w lweqt kaydouz`,
        `منزل مشغول وقائمة مهام كثيرة وإشعارات متتالية`),
      overlay: sentenceByLanguage(input.language,
        `Le problème : ${service.painFr}.`,
        `Lmouchkil: katqelleb 3la chi wa7ed thiqa w kaydi3 lweqt.`,
        `المشكلة: البحث يأخذ وقتاً والثقة مهمة.`),
      voice: sentenceByLanguage(input.language,
        `Le problème, c’est ${service.painFr}. Et chaque mauvais choix coûte du temps, de l’énergie et parfois de l’argent.`,
        `Lmouchkil machi ghir tlqa chi wa7ed. Lmouchkil howa tlqa profil thiqa, f lweqt, w bla stress.`,
        `المشكلة ليست فقط في إيجاد شخص، بل في إيجاد شخص موثوق وفي الوقت المناسب وبدون توتر.`),
      transition: 'cut sec',
      emoji: '⚠️'
    },
    {
      role: 'solution',
      visual: sentenceByLanguage(input.language,
        `Interface Yallah Services : choix du service, ville, disponibilité`,
        `Interface Yallah Services: service, mdina, disponibilité`,
        `واجهة يلاه سيرفيسز: اختيار الخدمة والمدينة والتوفر`),
      overlay: sentenceByLanguage(input.language,
        `Yallah Services simplifie la recherche.`,
        `Yallah Services kaysehhel 3lik l recherche.`,
        `يلاه سيرفيسز تسهّل عليك البحث.`),
      voice: sentenceByLanguage(input.language,
        `Avec Yallah Services, vous décrivez votre besoin, votre ville et vos critères. L’équipe vous aide à avancer vers le bon profil.`,
        `M3a Yallah Services, katgol lina chno bghiti, fin, w chno homa critères. Hna kan3awnouk bach tlqa profil mnasb.`,
        `مع يلاه سيرفيسز، تحدد حاجتك ومدينتك ومعاييرك، ونساعدك للوصول إلى الاختيار المناسب.`),
      transition: 'slide vertical',
      emoji: '⚡'
    },
    {
      role: 'proof',
      visual: sentenceByLanguage(input.language,
        `Avant/après : espace rangé, sourire, check-list validée`,
        `Qbel / ba3d: dar n9iya, check-list, client merta7`,
        `قبل وبعد: مساحة مرتبة وقائمة تحقق وعميل مطمئن`),
      overlay: sentenceByLanguage(input.language,
        `${service.benefitFr}.`,
        `Service mratb, suivi, w contact sahl.`,
        `خدمة منظمة، متابعة، وتواصل سهل.`),
      voice: sentenceByLanguage(input.language,
        `Résultat : ${service.benefitFr}, avec un contact simple et un message WhatsApp clair.`,
        `Ntiجة: service mratb, suivi, w contact f WhatsApp b tariqa sahla.`,
        `النتيجة: خدمة منظمة ومتابعة وتواصل واضح عبر واتساب.`),
      transition: 'flash propre',
      emoji: '✅'
    },
    {
      role: 'details',
      visual: sentenceByLanguage(input.language,
        `Trois bulles : besoin, disponibilité, quartier`,
        `3 points: service, lweqt, quartier`,
        `ثلاث نقاط: نوع الخدمة، التوقيت، الحي`),
      overlay: sentenceByLanguage(input.language,
        `Dites le service, le quartier et l’urgence.`,
        `Gol lina service, quartier, w wach urgent.`,
        `حدد الخدمة والحي ومدى الاستعجال.`),
      voice: sentenceByLanguage(input.language,
        `Pour aller plus vite, envoyez le type de service, votre quartier, les horaires souhaités et la date de début.`,
        `Bach nsehelou 3lik, sift lina service, quartier, horaires, w imta bghiti tebda.`,
        `لتسريع الطلب، أرسل نوع الخدمة والحي والتوقيت وتاريخ البداية.`),
      transition: 'pop des pictos',
      emoji: '📍'
    },
    {
      role: 'cta',
      visual: sentenceByLanguage(input.language,
        `Écran WhatsApp avec bouton vert, logo Yallah Services et promesse claire`,
        `Écran WhatsApp b bouton khder, logo Yallah Services`,
        `شاشة واتساب مع زر أخضر وشعار يلاه سيرفيسز`),
      overlay: sentenceByLanguage(input.language,
        `WhatsApp maintenant : réponse rapide à ${city}.`,
        `WhatsApp daba: jawb sari3 f ${city}.`,
        `واتساب الآن: رد سريع في ${city}.`),
      voice: cta,
      transition: 'zoom CTA',
      emoji: '📲'
    },
    {
      role: 'objection',
      visual: sentenceByLanguage(input.language,
        `Main qui hésite entre plusieurs annonces, puis choix Yallah Services`,
        `Wa7ed kay7ayer bin annonces, men ba3d kaykhtar Yallah Services`,
        `شخص متردد بين عدة إعلانات ثم يختار يلاه سيرفيسز`),
      overlay: sentenceByLanguage(input.language,
        `Évitez les profils au hasard.`,
        `Matkhtarsh b zhar.`,
        `لا تختر عشوائياً.`),
      voice: sentenceByLanguage(input.language,
        `Ne laissez pas votre besoin dépendre du hasard. Donnez les bons critères dès le départ.`,
        `Matkhallich had l7aja b zhar. 3tina critères mzyanin men lowel.`,
        `لا تجعل حاجتك مرتبطة بالصدفة. أعط المعايير الصحيحة من البداية.`),
      transition: 'split screen',
      emoji: '🚫'
    },
    {
      role: 'recap',
      visual: sentenceByLanguage(input.language,
        `Récapitulatif en 3 étapes avec fond marque Yallah`,
        `Résumé f 3 étapes b couleurs Yallah`,
        `ملخص في ثلاث خطوات بألوان يلاه`),
      overlay: sentenceByLanguage(input.language,
        `1 besoin. 2 critères. 3 WhatsApp.`,
        `1 besoin. 2 critères. 3 WhatsApp.`,
        `1 الحاجة. 2 المعايير. 3 واتساب.`),
      voice: sentenceByLanguage(input.language,
        `En résumé : dites votre besoin, ajoutez vos critères, puis envoyez “YALLAH” sur WhatsApp.`,
        `B lkhtissar: gol besoin dyalek, zid critères, w sift “YALLAH” f WhatsApp.`,
        `باختصار: حدد حاجتك، أضف معاييرك، ثم أرسل “YALLAH” عبر واتساب.`),
      transition: 'montage final',
      emoji: '🔥'
    }
  ];

  const count = durations.length;
  const selected = count === 4
    ? [scenePool[0], scenePool[1], scenePool[2], scenePool[5]]
    : count === 6
      ? [scenePool[0], scenePool[1], scenePool[2], scenePool[3], scenePool[4], scenePool[5]]
      : [scenePool[0], scenePool[1], scenePool[6], scenePool[2], scenePool[4], scenePool[3], scenePool[7], scenePool[5]];

  return selected.map((scene, index) => ({
    id: `scene-${index + 1}`,
    number: index + 1,
    duration: durations[index],
    startAt: durations.slice(0, index).reduce((sum, value) => sum + value, 0),
    ...scene,
    onScreenText: scene.overlay,
    caption: scene.voice.length > 118 ? `${scene.voice.slice(0, 115)}…` : scene.voice,
    prompt: `${scene.visual}. Format TikTok/Reels 9:16, ${styleData.energy}, lumière naturelle, aucun texte illisible, marque Yallah Services. Objectif: ${objective}.`
  }));
}

function buildCaption(input, service, hooks) {
  const city = cleanText(input.city, 'Casablanca');
  const serviceLocalized = serviceName(service, input.language);

  if (input.language === 'darija') {
    return `${hooks[0]}\n\nBghiti ${serviceLocalized} f ${city}? Sift lina message f WhatsApp w 9ol lina chno khassek.`;
  }

  if (input.language === 'ar') {
    return `${hooks[0]}\n\nهل تريد ${serviceLocalized} في ${city}؟ أرسل لنا رسالة واتساب واكتب احتياجك.`;
  }

  return `${hooks[0]}\n\nBesoin de ${serviceLocalized} à ${city} ? Envoyez-nous votre besoin sur WhatsApp et l’équipe Yallah Services vous répond.`;
}

function buildHashtags(input, service, style) {
  const city = cityHashtag(input.city);
  const base = ['#YallahServices', `#${city}`, '#ServicesADomicile', '#Maroc', '#TikTokMaroc'];
  const byService = {
    menage: ['#FemmeDeMenage', '#MenageMaison', '#MaisonPropre'],
    nounou: ['#Nounou', '#ParentsMaroc', '#BabySitting'],
    auxiliaire: ['#AuxiliaireDeVie', '#AideADomicile', '#Famille'],
    cuisiniere: ['#CuisineMaison', '#Cuisiniere', '#RepasMaison'],
    airbnb: ['#AirbnbMaroc', '#NettoyageAirbnb', '#LocationCourteDuree'],
    emploi: ['#OffreEmploi', '#RecrutementMaroc', '#JobMaroc'],
    yallah: ['#ServiceMaison', '#Yallah', '#CasaServices'],
    autre: ['#ServiceMaroc', '#SolutionRapide', '#WhatsAppBusiness']
  };
  const byStyle = {
    viral: ['#ViralMaroc', '#PourToi'],
    luxe: ['#PremiumService', '#LuxuryHome'],
    commercial: ['#BonPlan', '#ServiceClient'],
    emotion: ['#Famille', '#VieDeMaison'],
    urgent: ['#Urgent', '#Disponible'],
    storytelling: ['#StoryTime', '#AvantApres']
  };

  return [...base, ...(byService[input.service] || byService.autre), ...(byStyle[style] || byStyle.viral)].slice(0, 12);
}

function buildOptimization(input, hooks, scenes, viralBoost) {
  const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const hookWords = hooks[0].split(/\s+/).length;
  const sceneCount = scenes.length;
  const checks = [
    {
      label: 'Accroche dans les 2 premières secondes',
      status: hookWords <= 18 || viralBoost ? 'ok' : 'warning',
      tip: hookWords <= 18 ? 'Hook court et direct.' : 'Raccourcir le hook pour renforcer la rétention.'
    },
    {
      label: 'Rythme adapté au format court',
      status: sceneCount >= 4 ? 'ok' : 'warning',
      tip: `${sceneCount} scènes prévues pour éviter un plan trop long.`
    },
    {
      label: 'Clarté du service',
      status: 'ok',
      tip: 'Le service, la ville et le bénéfice sont répétés.'
    },
    {
      label: 'CTA WhatsApp visible',
      status: 'ok',
      tip: 'Le CTA est placé dans la scène finale et la caption.'
    },
    {
      label: 'Format 9:16',
      status: 'ok',
      tip: 'Storyboard et preview construits en vertical.'
    },
    {
      label: 'Promesse responsable',
      status: 'ok',
      tip: 'L’app optimise les facteurs de performance sans garantir le viral.'
    }
  ];

  const okCount = checks.filter(check => check.status === 'ok').length;
  const score = Math.min(96, Math.round((okCount / checks.length) * 82 + (viralBoost ? 12 : 6)));

  return {
    score,
    label: score >= 88 ? 'Très optimisé' : score >= 72 ? 'Bon potentiel' : 'À renforcer',
    totalDuration,
    retentionFactors: ['hook', 'rythme', 'lisibilité', 'preuve visuelle', 'CTA'],
    disclaimer: 'Score indicatif : il augmente les chances de performance, sans promettre qu’une vidéo deviendra virale.',
    checks
  };
}

function normalizeInput(input = {}) {
  const service = pickValid(input.service, SERVICE_KEYS, 'menage');
  const style = pickValid(input.style, STYLE_KEYS, 'viral');
  const language = pickValid(input.language, ['fr', 'darija', 'ar'], 'fr');
  const duration = [15, 30, 60].includes(Number(input.duration)) ? Number(input.duration) : 30;
  return {
    objective: cleanText(input.objective, 'Je veux trouver une femme de ménage à Casablanca'),
    city: cleanText(input.city, 'Casablanca'),
    whatsapp: cleanText(input.whatsapp, '+212 6 00 00 00 00'),
    service,
    style,
    language,
    duration,
    audience: cleanText(input.audience, SERVICES[service].audienceFr)
  };
}

function makeId() {
  return `yvs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateStudioProject(rawInput = {}, options = {}) {
  const input = normalizeInput(rawInput);
  const service = SERVICES[input.service];
  const styleData = STYLE_DATA[input.style];
  const hooks = buildHooks(input, service, input.style, Boolean(options.viralBoost));
  const scenes = buildSceneTemplates(input, service, styleData, hooks, Boolean(options.viralBoost));
  const hashtags = buildHashtags(input, service, input.style);
  const caption = buildCaption(input, service, hooks);
  const cta = ctaText(input, input.language);
  const voiceOver = scenes.map(scene => scene.voice).join(' ');
  const subtitles = scenes.map(scene => ({
    start: scene.startAt,
    end: scene.startAt + scene.duration,
    text: scene.caption
  }));
  const optimization = buildOptimization(input, hooks, scenes, Boolean(options.viralBoost));

  return {
    id: makeId(),
    title: `${service.emoji} ${serviceName(service, input.language)} · ${input.city}`,
    createdAt: new Date().toISOString(),
    input,
    language: {
      code: input.language,
      label: LANGUAGE_LABELS[input.language]
    },
    style: {
      code: input.style,
      ...styleData
    },
    hooks,
    script: {
      duration: optimization.totalDuration,
      targetDuration: input.duration,
      voiceOver,
      scenes
    },
    voice: {
      language: input.language === 'fr' ? 'fr-FR' : input.language === 'ar' ? 'ar-MA' : 'ar-MA',
      direction: input.language === 'ar' ? 'rtl' : 'ltr',
      note: input.language === 'darija'
        ? 'Darija en transcription latine : selon la voix disponible, tester aussi une version arabe marocaine.'
        : 'Voix off courte, souriante et commerciale.'
    },
    subtitles,
    cta,
    caption,
    hashtags,
    music: {
      brief: styleData.beat,
      volume: 'Voix à 100%, musique à 18–25%, ducking léger pendant la parole.'
    },
    export: {
      format: '9:16',
      recommendedResolution: '1080x1920',
      fps: 30,
      safeZones: 'Garder les textes centraux, éviter le bas droit TikTok/Reels.'
    },
    optimization,
    viralBoost: Boolean(options.viralBoost)
  };
}

export function improveStudioProject(project = {}) {
  const baseInput = project.input || project;
  const improvedInput = {
    ...baseInput,
    style: 'viral'
  };
  const improved = generateStudioProject(improvedInput, { viralBoost: true });
  improved.previousProjectId = project.id;
  improved.optimization.before = project.optimization?.score || null;
  improved.optimization.after = improved.optimization.score;
  improved.improvementNotes = [
    'Hook plus direct avec pattern interrupt.',
    'Scènes resserrées autour de problème → solution → preuve → CTA.',
    'CTA WhatsApp répété dans la voix off, l’écran final et la caption.',
    'Texte à l’écran plus court pour améliorer la lisibilité mobile.'
  ];
  return improved;
}
