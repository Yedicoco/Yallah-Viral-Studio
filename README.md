# Yallah Viral Studio

Studio de création de contenus courts, commerciaux et accrocheurs pour **Yallah Services** : TikTok, Instagram Reels et YouTube Shorts.

**V2 — génération vidéo IA open source** : en un clic, le studio produit désormais la **vidéo finale MP4 (H.264 + AAC, 720×1280, 30 i/s)** avec voix off synthétisée, bande-son musicale et montage animé — sans clé API, sans service payant, 100 % hors-ligne.

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

## Fonctionnalités V2.2

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
- Bibliothèque locale des vidéos créées via `localStorage`.

> Note responsable : l'application n'affirme pas qu'une vidéo deviendra virale. Elle optimise les facteurs qui augmentent les chances de performance : rétention, hook, rythme, clarté, engagement et CTA.

## Démarrage

```bash
npm install        # installe ffmpeg + canvas + polices (paquets npm, aucun service distant)
npm run setup      # extrait les polices TTF (Inter + Noto Sans Arabic) dans assets/fonts/
npm start
```

Puis ouvrir : <http://localhost:4173>

Remplir le brief → **Générer la vidéo** → **🎬 Générer la vidéo IA (MP4)**.
La progression s'affiche en direct (voix off scène par scène, animation, encodage) et la vidéo
apparaît dans un lecteur intégré avec bouton de téléchargement.

### Voix off : deux niveaux de qualité

- **Par défaut (zéro configuration)** : espeak-ng — robotic mais fiable, timing précis, 100 % hors-ligne.
- **Qualité neuronale (recommandé)** : déposer les modèles [Piper](https://github.com/rhasspy/piper) dans `assets/models/` :
  - `fr_FR-tom-medium.onnx` (+ `.json`) pour le français,
  - `ar_JO-kareem-medium.onnx` (+ `.json`) pour l'arabe et la darija.
  Le moteur Piper est détecté automatiquement (`GET /api/voices` pour vérifier). Voir `docs/generation-video-ia.md`.

### Notes de rendu

- La durée du MP4 s'adapte à la durée réelle de la voix off (une vidéo « 30 s » peut durer 35-45 s avec la voix espeak ; Piper est plus rapide).
- Les vidéos sont conservées 3 h côté serveur (répertoire temporaire), puis purgées automatiquement.
- La darija (transcrite en latin) est lue par la voix arabe : le rendu reste approximatif — une vraie voix TTS darija reste la limite n°2 (voir docs).
- Aucune garantie de viralité : le score /100 reste une checklist interne.

Pour vérifier la syntaxe :

```bash
npm run check
```

## API locale

Le serveur Node expose les endpoints utilisés par le frontend :

- `GET /api/health` : état du service, coordonnées officielles et moteurs de rendu disponibles.
- `POST /api/generate` : génère un projet vidéo à partir du brief.
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

Exemple :

```bash
curl -X POST http://localhost:4173/api/generate \
  -H 'content-type: application/json' \
  -d '{
    "objective": "Je veux trouver une femme de ménage à Casablanca",
    "city": "Casablanca",
    "service": "menage",
    "duration": 30,
    "style": "viral",
    "language": "fr",
    "whatsapp": "+212 691733585",
    "email": "servicesyallah@gmail.com",
    "tiktok": "@yallah.services.m",
    "instagram": "@yallahservice"
  }'
```

## Structure

```text
index.html          Interface principale
server.mjs          Serveur statique + API locale
lib/generator.mjs   Moteur de génération de hooks/scripts/storyboards (constante YALLAH_CONTACT)
src/main.js         Logique frontend, bibliothèque, export, preview
src/styles.css      Design responsive dark/premium
```

## État de la chaîne V2.2

La chaîne actuelle combine génération de projet, LLM local optionnel, rendu d’affiche serveur, voix off, animation Ken Burns, mixage audio et encodage MP4. La charte est centralisée dans `assets/brand.json` afin que les futures corrections de couleur, typographie ou ton soient répercutées au même endroit.

Les limites restantes concernent principalement la personnalisation de la charte à partir de publications réelles, la disponibilité de modèles Piper et l’absence de stockage cloud/authentification pour un usage multi-utilisateur.
