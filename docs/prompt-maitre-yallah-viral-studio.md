# Prompt maître — Yallah Viral Studio

Utilise ce prompt pour demander à un agent IA de développement d'industrialiser l'application **Yallah Viral Studio** de A à Z.

---

Tu es un agent IA senior full-stack. Construis **Yallah Viral Studio**, une application web SaaS pour Yallah Services permettant de produire rapidement des vidéos TikTok/Reels/Shorts courtes, commerciales et accrocheuses.

## Objectif produit

L'utilisateur entre un objectif simple, par exemple :

> Je veux trouver une femme de ménage à Casablanca

L'application génère automatiquement :

- 3 à 5 hooks TikTok/Reels,
- un script 15s, 30s ou 60s,
- une voix off en français, darija marocaine ou arabe,
- un storyboard scène par scène,
- des textes écran,
- des sous-titres dynamiques,
- un CTA WhatsApp + email,
- une caption,
- des hashtags adaptés,
- une vidéo exportable en 9:16.

## Coordonnées officielles Yallah Services (à utiliser partout)

- **GSM / WhatsApp :** `+212 691733585`
- **Email :** `servicesyallah@gmail.com`

Ces coordonnées doivent apparaître systématiquement dans :

- le formulaire de brief (valeurs par défaut des champs GSM/WhatsApp et email),
- le CTA généré (voix off, écran final, caption),
- la caption générée,
- le README, la documentation et l'API.

Elles sont centralisées dans une seule constante (`YALLAH_CONTACT`) côté générateur : ne jamais les dupliquer en dur ailleurs.

L'application doit rester responsable : elle ne promet jamais qu'une vidéo deviendra virale. Elle indique qu'elle optimise les facteurs qui augmentent les chances de performance : hook, rétention, rythme, clarté, lisibilité, engagement et CTA.

## Parcours V1

1. Authentification utilisateur.
2. Écran principal : brief vidéo.
3. Génération IA du contenu.
4. Preview verticale type smartphone.
5. Bouton **🔥 Rendre plus viral** pour générer une version plus performante.
6. Édition manuelle des hooks, scènes, sous-titres, voix off, caption et hashtags.
7. Génération voix off.
8. Montage vidéo 9:16 à partir des scènes, médias, textes et audio.
9. Export MP4.
10. Bibliothèque des projets générés.

## Services proposés

- Femme de ménage
- Nounou
- Auxiliaire de vie
- Cuisinière
- Grand ménage Airbnb
- Offre d'emploi
- Services Yallah Services
- Autre

## Paramètres de génération

- Durée : 15s, 30s, 60s.
- Style : Viral, Luxe, Commercial, Émotion, Urgent, Storytelling.
- Langue : Français, Darija marocaine, Arabe.
- Ville.
- Numéro GSM/WhatsApp (`+212 691733585`).
- Email de contact (`servicesyallah@gmail.com`).
- Audience cible.
- Niveau d'énergie.
- Option : utiliser images/vidéos uploadées par l'utilisateur.

## Frontend attendu

Construis une interface moderne, responsive et premium avec :

- dashboard clair,
- formulaire de brief,
- preview téléphone 9:16,
- onglets Hooks / Script / Storyboard / Sous-titres / Caption / Optimisation,
- éditeurs inline,
- bibliothèque des vidéos,
- statuts de génération,
- gestion d'erreurs propre,
- design cohérent Yallah Services : vert, jaune, noir, blanc.

## Backend attendu

Créer une API robuste avec :

- gestion utilisateurs,
- projets vidéo,
- génération de scripts IA,
- amélioration « Rendre plus viral »,
- génération voix off,
- génération sous-titres,
- orchestration des jobs vidéo,
- stockage des médias,
- export MP4,
- webhooks de paiement,
- quotas par plan.

## IA et prompts

Créer des prompts système séparés pour :

1. Hook generator.
2. Script generator.
3. Storyboard generator.
4. Subtitle generator.
5. Caption/hashtag generator.
6. Viral optimizer.
7. Quality checker TikTok/Reels.

Le module « Viral optimizer » doit transformer des phrases faibles en accroches plus fortes sans mentir et sans promesse excessive.

Exemple :

- Entrée : « Nous recherchons une femme de ménage à Casablanca. »
- Sortie : « Vous cherchez une femme de ménage fiable à Casablanca ? Attendez… ne contactez personne avant de voir ça ! »

## Génération vidéo

Implémenter un pipeline :

1. Générer storyboard structuré.
2. Associer chaque scène à une source média : IA, stock, upload ou template.
3. Générer/ajouter voix off.
4. Générer sous-titres synchronisés.
5. Composer la vidéo 9:16 avec textes, transitions, musique et CTA.
6. Exporter en MP4 H.264.
7. Stocker le fichier final et afficher un lien de téléchargement.

Prévoir une file de jobs asynchrones pour les rendus longs.

## Données projet

Chaque projet doit contenir :

```json
{
  "id": "string",
  "userId": "string",
  "objective": "string",
  "service": "menage | nounou | auxiliaire | cuisiniere | airbnb | emploi | yallah | autre",
  "city": "string",
  "language": "fr | darija | ar",
  "duration": 15,
  "style": "viral | luxe | commercial | emotion | urgent | storytelling",
  "hooks": ["string"],
  "scenes": [
    {
      "number": 1,
      "duration": 4,
      "visualPrompt": "string",
      "onScreenText": "string",
      "voiceOver": "string",
      "subtitle": "string",
      "transition": "string"
    }
  ],
  "cta": "string",
  "caption": "string",
  "hashtags": ["string"],
  "optimizationScore": 90,
  "status": "draft | rendering | ready | failed",
  "videoUrl": "string"
}
```

## Authentification, stockage, paiement

Prévoir :

- auth email/password + OAuth optionnel,
- stockage cloud des médias et vidéos,
- base de données relationnelle,
- plans gratuits/payants,
- quotas de générations,
- historique de facturation.

## Critères qualité

- Format 9:16 respecté.
- Hook visible dans les 2 premières secondes.
- Textes lisibles sur mobile.
- CTA WhatsApp et email présents à la fin, dans la caption et dans les exports.
- Sous-titres synchronisés.
- Export MP4 fonctionnel.
- Interface utilisable sur mobile.
- Tests unitaires pour les générateurs.
- Tests d'intégration pour API projet et rendu.
- Pas de promesse de viralité garantie.

## Livrables

- Code frontend.
- Code backend.
- Schéma base de données.
- Prompts IA versionnés.
- Pipeline vidéo.
- Documentation d'installation.
- Variables d'environnement exemple.
- Tests.
- Instructions de déploiement.

---

Commence par livrer une V1 fonctionnelle, puis isole les modules IA et vidéo pour pouvoir les remplacer facilement par des services production.
