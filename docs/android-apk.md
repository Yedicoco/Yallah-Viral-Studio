# Application Android et build APK

Yallah Viral Studio dispose d’un client Android natif dans `android/`. Il ouvre le studio comme origine principale dans une WebView durcie afin de conserver correctement les sessions `HttpOnly`, la protection CSRF et les téléchargements authentifiés.

## Architecture importante

L’APK est un **client mobile**, pas une copie du moteur Node :

- le compte, SQLite/libSQL, Piper/espeak, Canvas et FFmpeg restent sur le serveur ;
- l’appareil Android affiche l’interface et télécharge les PNG, JSON, WebM ou MP4 ;
- à la première ouverture, l’utilisateur saisit l’URL HTTPS du serveur déployé ;
- cette URL est conservée uniquement dans les préférences privées de l’application.

Cette séparation évite d’embarquer un serveur Node, des modèles ONNX et un encodeur FFmpeg de bureau dans chaque téléphone. Elle garantit aussi qu’un compte retrouve la même bibliothèque sur le Web et dans l’APK.

## APK de test installable

Prérequis locaux :

- JDK 17 ;
- Android SDK Platform 36 et Build Tools 36.0.0 ;
- `ANDROID_HOME` ou `ANDROID_SDK_ROOT` configuré.

```bash
npm run android:check
npm run android:build
```

L’APK signé avec la clé Android de développement est copié dans :

```text
.artifacts/Yallah-Viral-Studio-v2.4.0-debug.apk
.artifacts/Yallah-Viral-Studio-v2.4.0-debug.apk.sha256
```

Un build de test accepte HTTP pour faciliter les essais sur réseau local. Depuis l’émulateur Android, `http://10.0.2.2:4173` désigne le serveur lancé sur l’ordinateur hôte. Une vraie installation publique doit utiliser HTTPS.

### Vérifier et installer

Téléchargez ensemble l’APK et son fichier `.sha256`, puis vérifiez l’intégrité avant installation :

```bash
cd .artifacts
sha256sum --check Yallah-Viral-Studio-v2.4.0-debug.apk.sha256
adb install -r Yallah-Viral-Studio-v2.4.0-debug.apk
```

Sur un téléphone sans `adb`, ouvrez l’APK téléchargé, autorisez temporairement l’installation depuis cette source, puis retirez cette autorisation. L’APK debug porte l’identifiant distinct `ma.yallahservices.viralstudio.debug` et peut cohabiter avec une future version de production.

## URL serveur intégrée au build

L’écran de configuration peut être évité en injectant l’URL au moment du build :

```bash
YVS_ANDROID_SERVER_URL='https://studio.example.ma' npm run android:build
```

Ne placez aucun jeton ni secret dans cette URL. Elle est publique dans l’APK. Si la variable reste vide, l’écran de connexion au serveur s’affiche au premier lancement.

Dans GitHub Actions, la même valeur peut être définie dans la variable de dépôt `YVS_ANDROID_SERVER_URL` ou saisie lors du lancement manuel du workflow **Android APK**.

> **Vous débutez et ne voulez pas manipuler de serveur ?** Le dépôt fournit un
> déploiement « un clic » (`render.yaml` + `Dockerfile`) pour publier ce serveur
> sur **Render** et obtenir une URL HTTPS durable, puis graver cette URL dans
> l’APK via la variable `YVS_ANDROID_SERVER_URL`. Guide simplifié pas à pas :
> [`docs/deploy-public.md`](docs/deploy-public.md).

## Sécurité du client

- Identifiant Android : `ma.yallahservices.viralstudio` (`.debug` pour l’APK de test).
- API minimale : Android 7.0 (API 24) ; cible : API 36.
- HTTPS obligatoire en release ; certificats invalides systématiquement refusés.
- Navigation interne limitée à l’origine exacte configurée ; TikTok, Instagram, email et autres liens sont envoyés vers les applications externes.
- Cookies tiers désactivés, accès `file://`/contenu local désactivé, contenu mixte bloqué.
- Aucun mot de passe, cookie ou jeton n’est exposé au code natif.
- Le pont JavaScript natif ne sait qu’enregistrer un export base64, avec nom nettoyé et limite stricte de 25 Mio.
- Les MP4 authentifiés sont téléchargés avec le cookie de session via le gestionnaire Android.
- Sauvegarde Android désactivée afin de ne pas exporter la configuration ou les données WebView.

## GitHub Actions

`.github/workflows/android-apk.yml` :

1. valide le Gradle Wrapper et son empreinte SHA-256 ;
2. installe Java 17 et Android SDK 36 ;
3. vérifie la politique WebView/TLS et exécute Android Lint ;
4. construit un APK debug réellement installable ;
5. inspecte son manifeste avec `aapt` ;
6. publie l’APK, son SHA-256 et le rapport `badging` pendant 14 jours.

## Release Play Store

`npm run android:build:release` produit un APK release **non signé**. Pour publier, utilisez une clé durable stockée dans le gestionnaire de secrets de la CI, signez avec `apksigner`, puis conservez cette clé pour toutes les mises à jour futures. Ne versionnez jamais de fichier `.jks`/`.keystore` ni son mot de passe.

Pour Google Play, il est également recommandé de produire un Android App Bundle (`:app:bundleRelease`) et d’activer Play App Signing.
