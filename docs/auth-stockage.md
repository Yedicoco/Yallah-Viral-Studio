# Authentification et stockage multi-utilisateur

Depuis la V2.3, le studio ne dépend plus de `localStorage` pour sa bibliothèque. Les comptes, sessions et projets sont gérés côté serveur dans une base **libSQL** : SQLite local en développement, ou libSQL/Turso managé en production.

## Architecture

| Élément | Implémentation |
| --- | --- |
| Mot de passe | `crypto.scrypt` (sel aléatoire par compte, paramètres enregistrés avec le hash) |
| Session | jeton aléatoire 256 bits ; seul son SHA-256 est stocké en base |
| Cookie | `HttpOnly`, `SameSite=Lax`, `Secure` automatiquement sous HTTPS, durée 30 jours |
| CSRF | jeton HMAC lié à la session, obligatoire sur toute écriture authentifiée |
| Anti-bruteforce | limitation par IP sur inscription/connexion |
| Isolation | chaque requête bibliothèque et chaque job vidéo est lié au `user_id` authentifié |
| Base locale | `data/yallah-viral-studio.db`, ignorée par Git |
| Base cloud | toute URL `libsql://…` supportée par `@libsql/client` |

Le schéma (`users`, `sessions`, `projects`) est créé automatiquement au démarrage. Les emails sont uniques sans tenir compte de la casse. Une limite de 100 projets par compte évite une croissance locale non bornée.

## Développement local

```bash
npm install
npm start
```

Sans configuration, la base persistante est créée dans `data/`. À la première ouverture, créez un compte depuis l'écran sécurisé. Une ancienne bibliothèque navigateur est migrée automatiquement vers le compte après la première connexion réussie.

Pour repartir de zéro en développement uniquement : arrêter le serveur puis supprimer `data/yallah-viral-studio.db`.

## Déploiement cloud avec Turso/libSQL

1. Créer une base libSQL chez le fournisseur choisi.
2. Stocker l'URL et le jeton dans le gestionnaire de secrets de l'hébergeur.
3. Générer un secret de session identique sur toutes les instances :

```bash
openssl rand -base64 48
```

4. Démarrer avec les variables suivantes :

```bash
export YVS_DATABASE_URL='libsql://votre-base.turso.io'
export YVS_DATABASE_AUTH_TOKEN='…'
export YVS_SESSION_SECRET='…'
export YVS_AUTH_REQUIRED=true
export YVS_ALLOW_REGISTRATION=true
npm start
```

Une fois les comptes créés, `YVS_ALLOW_REGISTRATION=false` ferme les inscriptions publiques sans empêcher les utilisateurs existants de se connecter.

> Ne placez jamais `YVS_DATABASE_AUTH_TOKEN` ou `YVS_SESSION_SECRET` dans Git, dans le frontend ou dans une URL publique. Le fichier `.env.example` ne contient que des placeholders et l'application ne charge pas automatiquement les fichiers `.env`.

## API de compte

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/auth/session` | public, retourne l'état de session et le token CSRF si connecté |
| `POST` | `/api/auth/register` | public si inscriptions ouvertes |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | session + CSRF |
| `GET` | `/api/projects` | session |
| `POST` | `/api/projects` | session + CSRF |
| `GET` | `/api/projects/:id` | propriétaire uniquement |
| `DELETE` | `/api/projects/:id` | propriétaire + CSRF |
| `DELETE` | `/api/projects` | propriétaire + CSRF |

Les autres routes de génération et de rendu sont également protégées. Un utilisateur ne peut ni lire le projet, ni suivre le job, ni télécharger le MP4 d'un autre utilisateur.

## Ce qui est persistant

- **Comptes, sessions et projets JSON** : persistants en SQLite/libSQL.
- **MP4 rendus et posters de job** : fichiers temporaires pendant 3 heures. Le projet et ses métadonnées restent sauvegardables, mais les gros médias ne sont pas injectés en base SQL.

Pour conserver durablement les MP4 en production, brancher un stockage objet S3/R2 sur la fin de `lib/video-jobs.mjs`. La séparation actuelle évite de stocker des blobs vidéo coûteux dans la base relationnelle.

## Vérifications

```bash
npm run test:integration  # isolation comptes/projets, cookies et CSRF
npm run test:e2e          # compte → projet → affiche → voix → MP4 + contrôle propriétaire
```

Le smoke test crée deux comptes temporaires et confirme qu'un compte extérieur reçoit `404` sur le job vidéo du propriétaire.
