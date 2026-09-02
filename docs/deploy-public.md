# Déployer le serveur en public et le relier à l'APK

Ce projet est un **client-serveur** : le téléphone (APK) affiche l'interface,
mais c'est ce serveur Node (`server.mjs`) qui fait tout — génération vidéo,
voix, comptes, base de données. **Un APK sans serveur ne peut rien générer.**

Cette page vous montre, sans jargon et en quelques clics, comment obtenir un
serveur **public et HTTPS** (donc durable, utilisable sur un vrai téléphone),
puis comment **graver son adresse dans l'APK** pour qu'il démarre directement
sans écran de saisie.

---

## Pourquoi une adresse est nécessaire

- L'adresse saisie ou intégrée dans l'APK = **l'endroit où tourne ce serveur**.
- Sans être intégrée, l'app vous demande de **taper l'adresse au premier lancement**.
- Intégrée au build (`DEFAULT_SERVER_URL`), **le téléphone s'y connecte automatiquement**.

---

## Étape A — Obtenir une URL publique en un clic (hébergeur gratuit)

Le dépôt contient déjà un paquet de déploiement prêt :
`Dockerfile`, `render.yaml`, `requirements-tts-espeak.txt`.

Nous recommandons **Render** : vous ne « manipulez pas de serveur », vous
**cliquez sur un bouton** et Render s'occupe de tout, URL HTTPS comprise.

1. **Créez un compte** gratuit sur <https://render.com> (e-mail + mot de passe).
2. Connectez ensuite votre compte **GitHub** (Render le demande).
3. Assurez-vous que ce dépôt (`Yedicoco/Yallah-Viral-Studio`) est sur votre compte
   GitHub et à jour.
4. Sur Render : **New → Blueprint** → recherchez ce dépôt → **Apply**.
5. Attendez le build (≈ 2 à 5 min). Render vous donne une URL du type :

   ```
   https://yallah-studio.onrender.com
   ```

> C'est cette **URL** qu'il faut mémoriser. Vérifiez qu'elle répond en l'ouvrant
> dans un navigateur : vous devez voir la page de connexion du studio.

### (Astuce) Si vous préférez Railway, Fly.io ou un VPS

Le `Dockerfile` fonctionne à l'identique sur **Railway**, **Fly.io** ou n'importe
quel hôte Docker. Sur ces plateformes :

- démarrez le service depuis le `Dockerfile` ;
- le serveur écoute sur le port `$PORT` (défini automatiquement) ;
- votre URL est fournie par la plateforme (ex. `https://yallah.fly.dev`).

---

## Étape B — Graver l'URL dans l'APK (pour démarrer sans saisie)

Il y a **deux façons** d'intégrer l'URL. Choisissez **une** seule.

### Option 1 — Via GitHub Actions (recommandé, aucun outil à installer)

1. Allez sur GitHub : **Settings → Secrets and variables → Actions → Variables**.
2. Cliquez **New repository variable ».**
   - **Name** : `YVS_ANDROID_SERVER_URL`
   - **Value** : l'URL de l'Étape A (ex. `https://yallah-studio.onrender.com`)
3. Enregistrez.
4. Allez dans **Actions → Android APK → Run workflow** (ou poussez une
   modification dans `android/`).
5. À la fin du build, téléchargez l'artefact
   `Yallah-Viral-Studio-Android-<sha>` : c'est l'APK avec l'URL intégrée.
6. Installez l'APK sur votre téléphone → **il se connecte tout seul**, plus d'écran
   de saisie.

### Option 2 — À la compilation sur votre machine (développeur)

```bash
YVS_ANDROID_SERVER_URL='https://yallah-studio.onrender.com' npm run android:build
```

L'APK debug est écrit dans `.artifacts/`.

> ⚠️ Ne mettez **aucun mot de passe ni jeton** dans l'URL : elle est lisible dans
> l'APK. Inscrivez-vous sur le serveur depuis l'app et votre compte est enregistré
> côté serveur.

---

## Étape C — Utiliser l'application

1. Ouvrez l'APK → il se connecte au serveur.
2. **Créez un compte** (l'inscription est activée par défaut).
3. Décrivez votre publicité → **Créer automatiquement** → le studio génère
   l'affiche, la voix et la vidéo.
4. Téléchargez l'export (PNG, JSON, MP4) dans votre galerie/Téléchargements.

---

## Parcourir l'écran de saisie (si vous voulez changer de serveur)

Même avec une URL intégrée, vous pouvez toujours la modifier depuis l'app via
le bouton **« Serveur ⚙ »** en haut. C'est utile pour basculer d'un serveur de
test vers le serveur de production.

---

## Stockage des données (durable)

Par défaut, le serveur utilise un fichier SQLite local (`data/…db`).

- Sur le plan **gratuit** de Render, le disque est temporaire : les comptes et
  projets repartent à zéro après un redéploiement (utile pour tester).
- Pour un **stockage durable** multi-instance, utilisez une base **libSQL/Turso**
  (gratuite) et renseignez deux variables :
  `YVS_DATABASE_URL=libsql://…turso.io` et `YVS_DATABASE_AUTH_TOKEN=…`.
  Voir `docs/auth-stockage.md`.

---

## Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'app affiche « Connexion impossible » | Le serveur est tombé, ou l'URL est fausse | Vérifiez l'URL dans le navigateur ; appuyez sur **Ouvrir le studio** |
| Certificat HTTPS invalide | URL non-HTTPS ou certificat expiré | Utilisez l'URL HTTPS fournie par l'hébergeur |
| Vidéo sans voix | Runtime TTS absent | Le `Dockerfile` installe espeak-ng ; si seul le fallback manque, relancez `npm run setup:voices` |
| Les comptes disparaissent après redéploiement | Stockage SQLite éphémère | Passez sur une base libSQL/Turso |
| L'APK veut quand même une adresse | URL non intégrée au build | Relancez le build avec `YVS_ANDROID_SERVER_URL` |
