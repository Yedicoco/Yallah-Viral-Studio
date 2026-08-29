# Brancher un LLM local (hooks et scripts originaux)

Le studio fonctionne sans LLM (moteur de templates déterministe, 100 % hors-ligne).
Si un **LLM local open source** est détecté, les hooks, les textes de scènes, la
caption et les hashtags deviennent **originaux à chaque génération** — sans clé API,
sans service payant, sans envoi de données sur Internet.

## 1. Options supportées (au choix)

### Ollama (le plus simple)

```bash
# installer Ollama : https://ollama.com
ollama pull qwen2.5:3b        # ou llama3.2:3b, mistral:7b, gemma2:2b…
ollama serve                  # démarre sur http://127.0.0.1:11434
npm start                     # le studio détecte Ollama automatiquement
```

### LM Studio

1. Ouvrir l'onglet « Local Server » et démarrer le serveur (port 1234).
2. `npm start` — détection automatique.

### llama.cpp server / llamafile / vLLM (API OpenAI-compatible)

```bash
YVS_LLM_BASE_URL=http://127.0.0.1:8080 npm start
# Le suffixe /v1 est ajouté automatiquement si absent.
```

## 2. Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `YVS_LLM_BASE_URL` | base du serveur LLM (force l'usage du LLM) | détection auto (Ollama puis LM Studio) |
| `YVS_LLM_API` | `openai` ou `ollama` | `openai` (ou `ollama` si le port 11434 est détecté) |
| `YVS_LLM_MODEL` | choisir un modèle précis | premier modèle listé par le serveur |
| `YVS_LLM_API_KEY` | jeton si votre serveur en exige un | vide |
| `YVS_LLM_TIMEOUT_MS` | délai max d'une génération texte | 75 000 |

Vérifier : `curl http://localhost:4173/api/llm-status` → `{"available":true,"provider":"Ollama","model":"qwen2.5:3b",…}`.
L'interface affiche aussi l'état sous le formulaire et un badge ✍️ à côté du score.

## 3. Fonctionnement et garanties

```
POST /api/generate
  ├─ generateCreativeLayer(input)        lib/llm.mjs
  │    ├─ détection du serveur local (Ollama / LM Studio / YVS_LLM_BASE_URL)
  │    ├─ prompt contraint (règles anti-promesses, langue, CTA officiel, JSON strict)
  │    ├─ appel /api/chat (Ollama) ou /chat/completions (OpenAI-compatible)
  │    └─ validation JSON stricte (longueurs, formats)
  ├─ si valide → mergeCreativeLayer()    lib/generator.mjs
  │    ├─ hooks/scènes/caption/hashtags du LLM
  │    ├─ GARANTIE SERVEUR : la scène CTA garde le WhatsApp et les pages officielles
  │    ├─ hashtags normalisés (#YallahServices en tête, 12 max)
  │    └─ complétion par les templates si le LLM est court
  └─ si invalide/absent → templates (comportement historique)
```

- Aucun texte du LLM n'est utilisé tel quel s'il enfreint les règles : les
  coordonnées officielles (`YALLAH_CONTACT`) sont réinjectées par le serveur.
- La vidéo IA (MP4) rendue ensuite utilise ces textes avec la même voix
  TTS, la même musique et le même moteur de dessin.
- « 🔥 Rendre plus viral » passe aussi par le LLM (`pattern interrupt`,
  contraste, urgence honnête) avec les anciens hooks en entrée.

## 4. Tester le branchement sans modèle ni GPU

Un serveur LLM factice est fourni (utile pour les tests et les démos) :

```bash
node scripts/llm-stub.mjs                      # port 8931, renvoie du JSON valide
YVS_LLM_BASE_URL=http://127.0.0.1:8931 npm start

# Vérifier le repli quand le LLM renvoie du non-sens :
YVS_STUB_MODE=garbage node scripts/llm-stub.mjs
```

## 5. Limites

- La qualité dépend du modèle local : 3B suffisent pour les hooks, 7B+ donnent
  des textes plus fins. La darija reste le point faible de la plupart des LLM
  ouverts (prévoir une relecture).
- Génération texte typique : 5-25 s selon le modèle et la machine (le bouton
  affiche l'attente ; le restant du studio reste utilisable).
- Si le serveur LLM s'arrête, le studio retombe automatiquement sur les
  templates : aucune erreur visible, le badge repasse à « ✍️ Templates ».
