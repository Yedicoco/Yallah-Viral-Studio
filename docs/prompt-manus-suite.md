# Brief d’amélioration — Yallah Viral Studio

## Périmètre confirmé

Ce document décrit le travail à poursuivre sur la génération d’affiches et de Reels pour Yallah Services. Il ne demande pas de collecte de captures Instagram ou TikTok et n’autorise aucune invention de logo, de charte ou de données de performance.

Le dépôt doit rester 100 % open source et fonctionner hors ligne, sans clé API ni service payant. Les coordonnées officielles sont intangibles : WhatsApp `+212 691733585`, email `servicesyallah@gmail.com`, TikTok `@yallah.services.m` et Instagram `@yallahservice`.

## État déjà validé

La chaîne V2.2 comprend la génération de projet, le storyboard 9:16, le rendu vidéo MP4 avec TTS, la musique procédurale, l’animation Ken Burns, FFmpeg, le moteur d’affiches serveur `lib/posters.mjs`, les formats Story 1080×1920 et carré 1080×1080, ainsi que la charte centralisée `assets/brand.json`.

Les fonds photo de service sont présents dans `assets/backgrounds/` pour `menage`, `nounou`, `airbnb`, `auxiliaire`, `cuisiniere`, `emploi`, `yallah` et `autre`. Ils doivent être utilisés en plein cadre, sans bandes floues, coutures, bordures, texte, logo ou watermark incorporé dans l’image.

## Objectifs visuels

Les affiches et les Reels doivent partager une même reconnaissance de marque : fond photo chaleureux et professionnel, voile de lisibilité, contraste élevé, badge de service, accroche courte, bénéfices limités, CTA WhatsApp clairement lisible et présence des réseaux officiels. La palette par défaut est teal `#20c997`, doré `#ffbe0b`, fond sombre `#070a12`, avec Inter pour le français et Noto Sans Arabic pour l’arabe.

Le moteur doit privilégier une hiérarchie simple : **marque → catégorie → problème ou promesse → preuve/bénéfices → CTA**. Une affiche ne doit pas devenir une brochure miniature. Le titre doit tenir en trois lignes maximum lorsque le format le permet ; les bénéfices doivent être limités à trois en Story et deux en carré ; les coordonnées doivent rester dans une zone sûre et lisible sur mobile.

## Règles d’implémentation

Le moteur serveur d’affiches est la seule source de rendu final des affiches. Ne pas réintroduire un export Canvas navigateur concurrent. Toute modification de couleur, de typographie, de ton ou de tagline doit passer par `assets/brand.json` et être consommée automatiquement par `lib/posters.mjs`.

Le logo ne doit être intégré que si un fichier officiel exploitable est fourni ou déjà présent. En l’absence de `assets/brand/logo.png`, le moteur doit conserver le repli texte `YALLAH SERVICES`. Il est interdit de fabriquer un faux logo à partir d’un nom rendu par une police.

Les textes doivent être rendus avec un support bidi correct pour l’arabe et la darija en arabe. Les coordonnées officielles doivent être imposées côté serveur, même si une entrée utilisateur est absente ou invalide. Le CTA ne doit jamais promettre la viralité, un résultat garanti ou un chiffre non vérifié.

## Formats attendus

| Usage | Format | Dimensions | Sortie |
| --- | --- | ---: | --- |
| Story Instagram, statut WhatsApp, Story Facebook | `story` | 1080×1920 | PNG |
| Publication carrée | `square` | 1080×1080 | PNG |
| Reel scénario | `scenario` | 720×1280 ou 1080×1920 selon le moteur | MP4 H.264 + AAC |
| Reel d’affiche | `poster` | 720×1280 ou 1080×1920 selon le moteur | MP4 avec affiche animée, voix et musique |

## Contrôles obligatoires

Avant chaque livraison, exécuter `npm run check`, vérifier que les coordonnées officielles apparaissent dans le CTA final, tester `POST /api/poster-render` pour `story` et `square`, puis lancer au moins un rendu `POST /api/video-render` en mode `poster`. Le test doit confirmer la présence du fichier image, du MP4, de l’audio et du plan de sous-titres.

Les modèles Piper et le LLM local sont des améliorations optionnelles dépendantes de l’environnement. Si les modèles ne sont pas installés, le repli espeak-ng et les templates déterministes doivent rester opérationnels. Aucun modèle, fichier de cache ou dossier `node_modules/` ne doit être commité.

## Ce qui reste volontairement en attente

Le logo officiel n’est pas créé automatiquement tant qu’aucun fichier source fiable n’est disponible. L’alignement pixel-perfect sur les publications réelles est également différé lorsqu’aucune capture ou source officielle exploitable n’est fournie. Cette retenue évite d’inventer une identité visuelle et protège la cohérence de marque.
