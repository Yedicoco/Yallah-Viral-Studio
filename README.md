# Yallah Viral Studio

Studio de création de contenus courts, commerciaux et accrocheurs pour **Yallah Services** : TikTok, Instagram Reels et YouTube Shorts.

**V2.4 — création automatique en une demande** : décrivez une idée et un effet, choisissez Affiche, Vidéo ou Les deux, puis le studio livre le contenu final. Le MP4 (H.264 + AAC, 720×1280, 30 i/s) inclut voix off synthétisée, musique, animation et sous-titres ; les projets restent privés et persistants par compte.

| Étape | Moteur (open source) |
| --- | --- |
| Voix off FR / Darija / Arabe | [Piper TTS](https://github.com/rhasspy/piper) si un modèle est présent, sinon espeak-ng (embarqué) |
| Musique | composition procédurale JS (kick, basse, nappes selon le style) |
| Montage animé 9:16 | `@napi-rs/canvas` + moteur partagé `lib/frame-draw.mjs` (identique à la preview) |
| Encodage | FFmpeg (libx264/AAC) via `@ffmpeg-installer` |
| Montage audio | ducking voix/musique + limiteur, mixage en JS pur |

## Coordonnées et pages officielles Yallah Services

| Canal | Valeur | Lien |
| --- | --- | --- |
| GSM / WhatsApp | `+212 691733585` | <https://wa.me/212691733585> |
| Email | `servicesyallah@gmail.com` | <mailto:servicesyallah@gmail.com> |
| TikTok | `@yallah.services.m` | <https://www.tiktok.com/@yallah.services.m> |
| Instagram | `@yallahservice` | <https://www.instagram.com/yallahservice> |

Ces coordonnées et pages sont les valeurs par défaut du formulaire, du CTA généré, de la caption générée et de l'API (constante `YALLAH_CONTACT` dans `lib/generator.mjs` : source de vérité unique).

## Fonctionnalités V2.4

- **Création automatique en une demande** : décrivez librement l’idée et l’effet en français, darija ou arabe, choisissez **Affiche**, **Vidéo** ou **Les deux** ; le studio détermine service, ville, langue, durée, audience, style et format, écrit le contenu, télécharge le PNG, lance le MP4 avec voix/musique/sous-titres/animation et sauvegarde le projet privé.
- **Réglages avancés conservés** : le formulaire détaillé reste disponible dans un panneau optionnel pour modifier manuellement le brief ou la voix.
- Créateur de script : hooks, scénario, voix off et CTA WhatsApp + email.
- Générateur de storyboard 9:16 : scènes, textes écran, transitions et prompts vidéo.
- Langues : français, darija marocaine et arabe.
- Styles : Viral, Luxe, Commercial, Émotion, Urgent, Storytelling.
- Bouton **« 🔥 Rendre plus viral »** : améliore hook, rythme, lisibilité et CTA.
- **Affiches professionnelles** : fonds photo par service + marque, badge, titre, arguments et carte WhatsApp — PNG 1080×1920 (Story) et 1080×1080 (carré), FR/darija/arabe.
- **Vidéo d'affiche avec votre voix** : écrivez votre texte de voix off dans le formulaire, il est synthétisé et posé sur l'affiche animée (MP4 avec audio).
- **LLM local optionnel** : si Ollama / LM Studio / un serveur OpenAI-compatible est détecté, hooks, script, caption et hashtags deviennent originaux à chaque génération — avec garanties serveur (coordonnées officielles imposées, aucune promesse de viralité). Voir `docs/llm-local.md`.
- Sous-titres automatiques par scène.
- Caption + hashtags adaptés au service et à la ville, avec les coordonnées officielles (GSM, email) et les pages TikTok/Instagram.
- Preview verticale type smartphone.
- Lecture voix off via la synthèse vocale du navigateur.
- Export JSON du projet.
- **Moteur serveur unique pour les affiches** : `lib/posters.mjs` utilise `assets/brand.json`, les fonds photo par service et les mêmes règles de marque pour Story et carré ; aucun export navigateur concurrent n’est utilisé.
- **Comptes sécurisés** : mots de passe hachés avec scrypt, sessions HttpOnly, protection CSRF et limitation des tentatives de connexion.
- **Bibliothèque multi-utilisateur persistante** : SQLite local par défaut ou libSQL/Turso cloud ; chaque compte ne voit que ses projets.
- Migration automatique de l’ancienne bibliothèque `localStorage` vers le compte connecté.
- **Client Android sécurisé** : APK natif connecté au même serveur, avec sessions persistantes, origine de confiance unique et téléchargement des exports authentifiés.

> Note responsable : l'application n'affirme pas qu'une vidéo deviendra virale. Elle optimise les facteurs qui augmentent les chances de performance : rétention, hook, rythme, clarté, engagement et CTA.

## Démarrage

```bash
npm install
npm run setup      # polices + runtime Piper/espeak + voix neuronales FR et arabe
npm start
```

`npm run setup` crée un environnement Python isolé `.venv/`, installe les versions TTS verrouillées, vérifie taille/empreinte des modèles Piper SIWIS (français) et Kareem (arabe), puis les auto-teste par synthèse réelle. Pour une CI légère qui utilise seulement le fallback déterministe : `npm run setup:voices -- --runtime-only`.

Puis ouvrir <http://localhost:4173>, créer un compte, décrire la publicité dans **Création en 1 demande**, choisir le résultat et cliquer **Créer automatiquement**. Le formulaire détaillé reste disponible sous **Réglages avancés**.
La progression s'affiche en direct (interprétation, affiche, voix off scène par scène, animation, encodage) et la vidéo
apparaît dans un lecteur intégré avec bouton de téléchargement.

### Voix off : installation vérifiée et repli fiable

- **Qualité neuronale recommandée** : `npm run setup:voices` installe Piper 1.7 dans `.venv/`, télécharge SIWIS (`fr_FR-siwis-medium`) et Kareem (`ar_JO-kareem-medium`), puis réalise une vraie synthèse d’auto-test pour chaque voix.
- **Repli automatique** : si un modèle Piper est incomplet ou échoue pendant un rendu, espeak-ng prend le relais au lieu de faire échouer la vidéo.
- **Diagnostic honnête** : `GET /api/voices` expose `engine`, `quality`, `ready` et `recommended` pour chaque langue ; l’API ne présente plus espeak comme une voix neuronale.

Les modèles volumineux restent dans `assets/models/` et ne sont pas versionnés. Voir `docs/generation-video-ia.md`.

### Notes de rendu

- La durée du MP4 s'adapte à la durée réelle de la voix off (une vidéo « 30 s » peut durer 35-45 s avec la voix espeak ; Piper est plus rapide).
- Les vidéos sont conservées 3 h côté serveur (répertoire temporaire), puis purgées automatiquement.
- La darija (transcrite en latin) est lue par la voix arabe : le rendu reste approximatif — une vraie voix TTS darija reste la limite n°2 (voir docs).
- Aucune garantie de viralité : le score /100 reste une checklist interne.

## Application Android

Le projet `android/` fournit un client natif léger pour le service déployé. Le téléphone n’exécute ni Node, ni SQLite, ni Piper, ni FFmpeg : l’APK se connecte au serveur HTTPS et retrouve les mêmes comptes, projets et rendus que l’application Web.

```bash
npm run android:check       # contrôle statique des règles TLS/WebView/Gradle
npm run android:build       # APK debug installable + empreinte SHA-256
```

Sans URL intégrée, l’utilisateur la saisit au premier lancement. Pour une installation gérée :

```bash
YVS_ANDROID_SERVER_URL='https://studio.example.ma' npm run android:build
```

Le workflow **Android APK** compile aussi le projet sur GitHub Actions et publie l’APK debug comme artefact. Prérequis, installation, sécurité et signature release : [`docs/android-apk.md`](docs/android-apk.md).

## Tests et smoke test

```bash
npm run check             # syntaxe de tous les modules
npm test                  # suite unitaire et intégration
npm run test:e2e          # compte → génération → stockage → affiche → voix → MP4
npm run verify            # syntaxe + suite automatisée
```

Le smoke test encode réellement une vidéo H.264/AAC 720×1280 à 30 i/s, contrôle ses flux avec FFmpeg et vérifie qu’un second compte ne peut pas accéder au job. GitHub Actions exécute automatiquement ces étapes et conserve les artefacts pendant 7 jours.

## API locale

Le serveur Node expose les endpoints utilisés par le frontend. Hors santé, diagnostic vocal et routes de connexion, l’API requiert une session ; les écritures requièrent aussi l’en-tête `X-YVS-CSRF` fourni par `GET /api/auth/session`.

- `GET /api/health` : état du service, auth, stockage, coordonnées officielles et moteurs disponibles.
- `GET /api/auth/session`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` : cycle de compte.
- `GET|POST|DELETE /api/projects` et `/api/projects/:id` : bibliothèque privée persistante.
- `POST /api/auto-create` : interprète `{"prompt":"…","output":"poster"|"video"|"both"}`, génère et sauvegarde le projet, renvoie le PNG demandé et/ou démarre le job MP4.
- `POST /api/generate` : génère un projet vidéo à partir du brief détaillé.
- `POST /api/viralize` : génère une version plus performante du projet courant.
- `POST /api/poster-render` : génère une affiche PNG (`{"format": "story"|"square"}`) → dataURL base64.
- `POST /api/video-render` : lance le rendu MP4 d'un projet (`mode: "scenario"|"poster"`, `voiceText` optionnel) (répond `{ id, status, progress }`).
- `GET /api/video-status/:id` : progression du rendu (étape, pourcentage, projet enrichi quand terminé).
- `GET /api/video-file/:id` : téléchargement du MP4.
- `GET /api/video-poster/:id` : affiche JPG (frame du hook).
- `GET /api/voices` : moteurs de synthèse vocale disponibles par langue.
- `GET /api/llm-status` : détection du LLM local (hooks originaux) — optionnel, repli templates automatique.

Si `whatsapp`, `email`, `tiktok` ou `instagram` sont absents ou invalides, le générateur retombe automatiquement sur les valeurs officielles :
`+212 691733585`, `servicesyallah@gmail.com`, `@yallah.services.m` et `@yallahservice`.

Exemple authentifié :

```bash
# Crée un compte et conserve le cookie HttpOnly.
curl -s -c cookies.txt http://localhost:4173/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"displayName":"Démo","email":"demo@example.com","password":"Demo-Yallah-2026"}'

# Récupère le jeton CSRF de la session.
CSRF=$(curl -s -b cookies.txt http://localhost:4173/api/auth/session \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).csrfToken))")

curl -s -b cookies.txt http://localhost:4173/api/generate \
  -H 'content-type: application/json' -H "X-YVS-CSRF: $CSRF" \
  -d '{"objective":"Trouver une femme de ménage","city":"Casablanca","service":"menage","duration":30,"style":"viral","language":"fr"}'
```

## Structure

```text
index.html            Interface principale + écran de compte
server.mjs            Serveur importable, API protégée et fichiers statiques
lib/auth.mjs          Scrypt, cookies de session et CSRF
lib/store.mjs         SQLite local / libSQL cloud, isolation des projets
lib/auto-brief.mjs    Interprétation FR/darija/arabe d’une demande libre
lib/generator.mjs     Hooks, scripts et storyboards
lib/video-jobs.mjs    File de rendu et propriété des jobs
scripts/smoke-e2e.mjs Smoke test MP4 réel
tests/                Tests unitaires et intégration
src/main.js           Frontend, compte, bibliothèque, export et preview
android/              Client natif sécurisé et projet Gradle de l’APK
docs/android-apk.md   Architecture mobile, build, installation et sécurité
```

## État de la chaîne V2.4

La chaîne combine génération de projet, LLM local optionnel, rendu d’affiche serveur, Piper/espeak, animation Ken Burns, mixage audio et encodage MP4. L’authentification, l’isolation des jobs et le stockage cloud des projets sont opérationnels et couverts par la CI. La charte reste centralisée dans `assets/brand.json`.

Limites restantes : les gros fichiers MP4 sont encore temporaires (3 h) plutôt que stockés dans un bucket objet, et la darija latine ne dispose pas encore d’un modèle neuronal marocain dédié. Voir [l’architecture d’authentification et stockage](docs/auth-stockage.md).
