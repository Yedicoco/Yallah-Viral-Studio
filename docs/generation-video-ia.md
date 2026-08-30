# Génération vidéo IA — architecture et limites

Ce document décrit le pipeline qui « termine l'objectif final » : transformer un brief
en **vidéo MP4 publiables** (TikTok, Reels, Shorts), sans clé API, sans service payant,
100 % open source et hors-ligne.

## 1. Vue d'ensemble

```
brief (formulaire)
  └─▶ POST /api/generate        → lib/generator.mjs   (projet JSON : hooks, scènes, caption…)
        └─▶ POST /api/video-render → lib/video-jobs.mjs
              1. TTS scène par scène      lib/tts.mjs       → WAV 22 kHz mono
              2. Timeline                 lib/audio.mjs     → plan de montage calé sur la voix
              3. Musique + mixage         lib/audio.mjs     → WAV final (ducking + limiteur)
              4. Animation des frames     lib/frame-draw.mjs→ JPEG 720×1280 @ 30 i/s
              5. Encodage                 FFmpeg            → MP4 H.264 + AAC 44,1 kHz stéréo
              6. Affiche JPG (hook)       frame 0,7 s
```

Un seul moteur de dessin (`lib/frame-draw.mjs`) est partagé entre la preview navigateur
et le rendu serveur : ce que vous voyez dans le téléphone de l'interface est ce que
contient le MP4.

## 2. Choix techniques et raison d'être

| Choix | Pourquoi |
| --- | --- |
| FFmpeg via `@ffmpeg-installer` (npm) | binaire statique précompilé, pas de compilation, pas d'apt |
| `@napi-rs/canvas` | canvas natif précompilé (pas de Cairo à compiler), API identique au DOM |
| Musique **procédurale** en JS | zéro échantillon téléchargé, zéro licence, boucles propres par style ; le brief musical du projet reste la référence pour une vraie production |
| TTS à deux étages | Piper neuronal installé et auto-testé par le setup ; espeak-ng prend automatiquement le relais en cas d'échec |
| Comptes et projets | SQLite local ou libSQL cloud, sessions HttpOnly et isolation stricte par propriétaire |
| Jobs en mémoire + médias dans le tmp OS | chaque job appartient à un compte ; fichiers purgés au bout de 3 h |
| File d'attente 1 rendu à la fois (+4 en attente) | les sandboxes/machines modestes restent stables |

## 3. Voix off

### Niveau 1 — Piper neuronal (recommandé)

```bash
npm run setup:voices
```

Cette commande :

1. crée `.venv/` pour ne pas modifier le Python système ;
2. installe les versions verrouillées de `piper-tts` et `espeakng-loader` ;
3. télécharge SIWIS medium pour le français et Kareem medium pour l'arabe ;
4. vérifie taille et empreinte du modèle/configuration, avec trois tentatives en cas de téléchargement incomplet ;
5. synthétise un vrai WAV avec chaque modèle avant de déclarer la voix prête.

`lib/tts.mjs` préfère SIWIS pour sa prosodie régulière et ne marque une voix Piper comme disponible que si le runtime, l'ONNX **et** son JSON adjacent sont lisibles.

### Niveau 2 — espeak-ng (repli automatique)

- Installé dans le même `.venv/` via `espeakng-loader`.
- Script : `scripts/tts_espeak.py` (synthèse via ctypes, sans binaire système).
- Si Piper échoue pendant la synthèse, la scène est automatiquement régénérée avec espeak au lieu d'annuler tout le MP4.
- Langues : `fr-fr` pour le français, voix `ar` pour l'arabe et la darija.
- La darija transcrite en lettres latines reste approximative.

Pour une CI sans téléchargement de modèles :

```bash
npm run setup:voices -- --runtime-only
```

Vérifier avec `GET /api/voices` : la réponse expose `renderReady`, `neuralReady` et, pour chaque langue, `engine`, `quality`, `ready`, `recommended` ainsi que la commande de correction.

## 4. Musique procédurale

`composeMusicBed(styleCode, durée)` synthétise en Float32 :

- une progression d'accords de 4 mesures (Am–F–C–G) en nappes,
- une basse syncopée propre au style,
- kick (four-on-the-floor ou half-time) et hats off-beat,
- normalisation −6 dBFS et fade-out final.

`mixVoiceAndMusic()` applique ensuite le ducking (musique à ~16 % sous la voix,
~34 % sinon, lissage 180 ms) et un limiteur souple (tanh).

C'est une **maquette sonore** volontairement simple : elle rythme la vidéo et
évite tout problème de droits. Pour une vraie prod musicale, remplacer
`composeMusicBed` par un fichier sous licence libre.

## 5. Timeline adaptative

`buildRenderTimeline()` :

1. chaque scène dure au minimum sa durée template **et** la durée réelle de sa voix
   (+ marges) — jamais de voix coupée ;
2. si le total dépasse 1,4 × la durée cible, toutes les scènes sont compressées
   proportionnellement, sauf à écraser la voix (plancher `voix + marge`).

La durée finale réelle est renvoyée dans `project.render.totalDuration` et affichée
dans l'interface.

## 6. Conformité TikTok/Reels

- 720×1280 (9:16), 30 i/s, H.264 High + AAC — réglages acceptés par toutes les plateformes.
- Textes critiques (sous-titres, CTA) maintenus au-dessus de ~200 px du bas (zones sûres).
- Sous-titres intégrés à l'image (incrustés), donc pas besoin de fichier SRT pour publier.

## 7. Limites connues (honnêteté oblige)

- ❌ Pas d'images générées par IA : l'animation est typographique/abstraite (dégradés,
  cercles, Ken Burns, pops). Les « prompts de scène » restent disponibles pour générer
  des visuels dans un outil dédié et les intégrer ensuite.
- ❌ Voix darija approximative (darija latine lue par une voix arabe).
- ❌ Musique simple (maquette procédurale).
- ❌ Rendu typographique uniquement — pas de deepfake ni d'avatar parlant.
- ⚠️ La vidéo « 30 s » peut durer 35-45 s : la timeline respecte la durée réelle de la voix.
- ⚠️ Médias rendus purgés après 3 h (redémarrage du serveur = MP4 temporaires perdus) ; les projets restent dans la bibliothèque SQLite/libSQL privée du compte.

## 8. Pour aller plus loin (feuille de route)

1. **Stockage objet S3/R2** pour conserver durablement les MP4 au-delà des 3 h temporaires.
2. **Voix TTS darija** entraînée (Piper fine-tune sur corpus darija).
3. **Images de fond générées** (SDXL/Stable Diffusion open weights) branchées sur les
   `scene.prompt` existants, avec fallback sur le rendu actuel.
4. **Sous-titres mot à mot** (karaoke-style) via alignement forcé ou timestamps Piper.
5. **File de rendu persistante** pour reprendre un encodage après redémarrage.
