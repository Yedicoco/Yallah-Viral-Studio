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
| TTS à deux étages | espeak-ng toujours disponible (embarqué) ; Piper (neuronal, bien meilleure qualité) activé automatiquement si un modèle est présent |
| Jobs en mémoire + fichiers dans le tmp OS | pas de base de données, pas de compte ; purge auto au bout de 3 h |
| File d'attente 1 rendu à la fois (+4 en attente) | les sandboxes/machines modestes restent stables |

## 3. Voix off

### Niveau 1 — espeak-ng (par défaut)

- Installé via le paquet pip `espeakng-loader` (bibliothèque + données embarquées).
- Script : `scripts/tts_espeak.py` (sinthèse via ctypes, sans binaire externe).
- Débit adaptatif : si la voix déborde de 30 % du budget de la scène, elle est
  re-synthétisée plus vite (jusqu'à 220 mots/min).
- Langues : `fr-fr` pour le français, voix `ar` pour l'arabe **et** la darija
  (la darija étant transcrite en lettres latines, la lecture reste approximative).

### Niveau 2 — Piper (recommandé, facultatif)

1. Télécharger les modèles depuis le catalogue [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) :
   - français : `fr/fr_FR/tom/medium/fr_FR-tom-medium.onnx` + `.onnx.json`
   - arabe : `ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx` + `.onnx.json`
2. Les déposer dans `assets/models/` (ignoré par Git).
3. `pip install piper-tts` (le code l'appelle via `python3 -m piper`).
4. Vérifier : `GET /api/voices` → `"engine": "piper"` pour les langues couvertes.

Aucun code à modifier : `lib/tts.mjs` choisit Piper dès que le fichier existe.

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
- ⚠️ Rendus purgés après 3 h (redémarrage du serveur = rendus perdus, les projets restent
  dans la bibliothèque locale du navigateur).

## 8. Pour aller plus loin (feuille de route)

1. **LLM** pour des hooks vraiment originaux (`lib/generator.mjs` est isolé, interface inchangée).
2. **Voix TTS darija** entraînée (Piper fine-tune sur corpus darija).
3. **Images de fond générées** (SDXL/Stable Diffusion open weights) branchées sur les
   `scene.prompt` existants, avec fallback sur le rendu typographique actuel.
4. **Sous-titres mot à mot** (karaoke-style) : le plan de timeline par scène est déjà là,
   il faut un alignement mot-à-mot (wav2vec2 forced alignment ou timestamps Piper).
5. **File de rendu persistante** (SQLite) si usage multi-utilisateurs.
