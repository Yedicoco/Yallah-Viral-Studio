# Yallah Viral Studio

Prototype V1 d'application pour créer rapidement des contenus courts, commerciaux et accrocheurs pour **Yallah Services** : TikTok, Instagram Reels et YouTube Shorts.

## Coordonnées officielles Yallah Services

- **GSM / WhatsApp :** `+212 691733585`
- **Email :** <servicesyallah@gmail.com>

Ces coordonnées sont les valeurs par défaut du formulaire, du CTA généré, de la caption générée et de l'API (`lib/generator.mjs`, constante `YALLAH_CONTACT`).

## Fonctionnalités V1

- Créateur de script : hooks, scénario, voix off et CTA WhatsApp + email.
- Générateur de storyboard 9:16 : scènes, textes écran, transitions et prompts vidéo.
- Langues : français, darija marocaine et arabe.
- Styles : Viral, Luxe, Commercial, Émotion, Urgent, Storytelling.
- Bouton **« 🔥 Rendre plus viral »** : améliore hook, rythme, lisibilité et CTA.
- Sous-titres automatiques par scène.
- Caption + hashtags adaptés au service et à la ville, avec les coordonnées officielles Yallah Services.
- Preview verticale type smartphone.
- Lecture voix off via la synthèse vocale du navigateur.
- Export JSON du projet.
- Export WebM d'une maquette visuelle 9:16 générée côté navigateur.
- Bibliothèque locale des vidéos créées via `localStorage`.

> Note responsable : l'application n'affirme pas qu'une vidéo deviendra virale. Elle optimise les facteurs qui augmentent les chances de performance : rétention, hook, rythme, clarté, engagement et CTA.

## Démarrage

Aucune dépendance externe n'est requise.

```bash
npm start
```

Puis ouvrir : <http://localhost:4173>

Pour vérifier la syntaxe :

```bash
npm run check
```

## API locale

Le serveur Node expose les endpoints utilisés par le frontend :

- `GET /api/health` : état du service et coordonnées officielles Yallah Services.
- `POST /api/generate` : génère un projet vidéo à partir du brief.
- `POST /api/viralize` : génère une version plus performante du projet courant.

Si `whatsapp` ou `email` sont absents ou invalides, le générateur retombe automatiquement sur les coordonnées officielles :
`+212 691733585` et `servicesyallah@gmail.com`.

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
    "email": "servicesyallah@gmail.com"
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

## Limites de cette V1

Cette V1 est un prototype fonctionnel sans appel à des modèles IA externes. Le moteur actuel utilise des templates intelligents et déterministes. Pour une version production, il faudra connecter :

- un LLM pour enrichir hooks et scripts,
- un service de text-to-speech compatible darija,
- un moteur de génération ou montage vidéo,
- un stockage cloud,
- l'authentification,
- la facturation,
- une file de jobs pour les rendus vidéo longs.
