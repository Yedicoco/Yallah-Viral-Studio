# Yallah Viral Studio — serveur autonome (Node + TTS espeak + FFmpeg).
# Conçu pour un déploiement « un clic » : Render (Blueprint), Railway, Fly.io
# ou tout hôte Docker : `docker build -t yallah-viral-studio . && docker run -p 4173:4173 yallah-viral-studio`.
#
# L'APK n'embarque pas ce moteur : il est le serveur auquel l'application Android
# (WebView) se connecte. Le rendre public et HTTPS est l'étape qui permet de
# graver l'adresse dans l'APK (BuildConfig.DEFAULT_SERVER_URL).

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# espeak-ng fournit les voix de secours FR/AR. les polices système garantissent
# le rendu des glyphes même si un font-file est absent. Python est requis par le
# runtime TTS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    espeak-ng \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances Node d'abord (cache de couches Docker efficace). Les devDependencies
# servent uniquement à régénérer les polices/icônes : elles ne sont pas nécessaires
# à l'exécution.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Runtime TTS minimal : uniquement espeakng-loader (léger, ~quelques Mo, sans
# modèle neuronal). Pour la voix neuronale Piper, lancer `npm run setup:voices`
# (télécharge ~130 Mo de modèles) et passer YVS_TTS_ENGINE sur "auto".
RUN python3 -m venv .venv \
    && .venv/bin/pip install --disable-pip-version-check --no-cache-dir \
         -r requirements-tts-espeak.txt

# Utilisateur non-root : limite la surface d'attaque et respecte les bonnes
# pratiques de confinement. L'image Node officielle fournit déjà le compte
# « node » ; le répertoire de données SQLite (/app/data) est créé et rendu
# inscriptible ; les rendus temporaires vont dans /tmp (1777 pour tous).
RUN mkdir -p /app/data \
    && chown -R node:node /app \
    && chmod 1777 /tmp
USER node

ENV HOST=0.0.0.0
ENV PORT=4173
ENV YVS_PYTHON=/app/.venv/bin/python
ENV YVS_TTS_ENGINE=espeak
ENV YVS_MODELS_DIR=/app/assets/models
# Base SQLite locale par défaut. Pour un stockage durable multi-instance,
# utiliser une base libSQL/Turso en production (voir docs/deploy-public.md).
ENV YVS_DATABASE_URL=file:data/yallah-viral-studio.db

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
