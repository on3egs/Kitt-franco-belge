#!/bin/bash
# ============================================================================
# KYRONEX HYPER FLUID - Script de démarrage pour K-4000 (Orin NX 8Go)
# ============================================================================
# Date: 2026-07-29
# Objectif: Démarrer Kyronex avec configuration HYPER FLUIDE
#   - Réponses INSTANTANEES (avant même la fin de la phrase)
#   - TTS PARALLELE avec la génération du texte
#   - Streaming mot-à-mot ultra-fluide
# ============================================================================

# NOTE: Ce script est conçu pour être exécuté SUR K-4000 (kitt_k4000)
# Copiez-le sur K-4000 avant de l'exécuter:
# scp start_k4000_hyper_fluid.sh K4000:/home/K4000/Kironext-K-4000/app/

set -e
set -o pipefail

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  KYRONEX HYPER FLUID - K-4000${NC}"
echo -e "${BLUE}  Configuration Ultra-Réactive${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# ============================================================================
# Vérifications pré-démarrage
# ============================================================================
echo -e "${YELLOW}[CHECK] Vérification des prérequis...${NC}"

# Vérifier que le modèle Qwen 2.5 3B existe
MODEL_PATH="/home/K4000/Kironext-K-4000/app/models/qwen2.5-3b-instruct-q5_k_m.gguf"
if [ ! -f "$MODEL_PATH" ]; then
    # Essayer le chemin alternatif
    MODEL_PATH="/home/karr/kitt-ai/models/qwen2.5-3b-instruct-q5_k_m.gguf"
    if [ ! -f "$MODEL_PATH" ]; then
        echo -e "${RED}[ERREUR] Modèle LLM introuvable: $MODEL_PATH${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ Modèle LLM trouvé: $MODEL_PATH${NC}"

# Vérifier que llama-server existe
LLAMA_SERVER="/home/karr/kitt-ai/llama.cpp_build/bin/llama-server"
if [ ! -f "$LLAMA_SERVER" ]; then
    echo -e "${RED}[ERREUR] llama-server introuvable: $LLAMA_SERVER${NC}"
    exit 1
fi
echo -e "${GREEN}✓ llama-server trouvé${NC}"

# Vérifier le fichier de configuration
CONFIG_FILE="$SCRIPT_DIR/kyronex_nx_8gb_hyper_fluid.env"
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}[ERREUR] Fichier de configuration introuvable: $CONFIG_FILE${NC}"
    echo "Copiez le fichier depuis karr:"
    echo "scp /home/karr/kitt-ai/kyronex_nx_8gb_hyper_fluid.env K4000:/home/K4000/Kironext-K-4000/app/"
    exit 1
fi
echo -e "${GREEN}✓ Configuration HYPER FLUID trouvée${NC}"

# Vérifier GPU
if ! nvidia-smi > /dev/null 2>&1; then
    echo -e "${RED}[ERREUR] NVIDIA GPU non détecté${NC}"
    exit 1
fi
echo -e "${GREEN}✓ GPU NVIDIA détecté${NC}"

echo ""

# ============================================================================
# Démarrer le serveur LLM avec configuration HYPER FLUID
# ============================================================================
echo -e "${YELLOW}[LLM] Démarrage de llama-server avec configuration HYPER FLUID...${NC}"

# Charger la configuration
source "$CONFIG_FILE"

echo "Paramètres LLM:"
echo "  - ctx-size: $OLLAMA_NUM_CTX"
echo "  - batch-size: $LLAMA_BATCH_SIZE"
echo "  - ubatch-size: $LLAMA_UBATCH_SIZE"
echo "  - threads: $LLAMA_THREADS"
echo "  - n-gpu-layers: $OLLAMA_NUM_GPU"
echo ""

# Arrêter les services existants
pkill -f "llama-server" 2>/dev/null || true
sleep 2

# Démarrer llama-server en arrière-plan
$LLAMA_SERVER \
  -m "$MODEL_PATH" \
  --host 0.0.0.0 \
  --port 8080 \
  --ctx-size $OLLAMA_NUM_CTX \
  --batch-size $LLAMA_BATCH_SIZE \
  --ubatch-size $LLAMA_UBATCH_SIZE \
  --threads $LLAMA_THREADS \
  --threads-batch ${LLAMA_THREADS_BATCH:-2} \
  --n-gpu-layers $OLLAMA_NUM_GPU \
  --flash-attn on \
  --load-mode mmap \
  --no-warmup \
  --log-level debug &

LLAMA_PID=$!
echo -e "${GREEN}✓ llama-server démarré (PID: $LLAMA_PID)${NC}"

# Attendre que le serveur soit prêt
for i in {1..30}; do
    if curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Serveur LLM prêt après $i secondes${NC}"
        break
    fi
    sleep 1
    echo -n "."
done

if ! curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
    echo -e "${RED}[ERREUR] Impossible de démarrer le serveur LLM${NC}"
    kill $LLAMA_PID 2>/dev/null
    exit 1
fi

echo ""

# ============================================================================
# Démarrer Kyronex Server
# ============================================================================
echo -e "${YELLOW}[KYRONEX] Démarrage de kyronex_server.py...${NC}"

echo "Paramètres Streaming:"
echo "  - STREAMING_MIN_WORDS: ${STREAMING_MIN_WORDS:-1}"
echo "  - STREAMING_MIN_CHARS: ${STREAMING_MIN_CHARS:-3}"
echo "  - STREAMING_MAX_DELAY_MS: ${STREAMING_MAX_DELAY_MS:-30}"
echo "  - STREAMING_MAX_QUEUE_SIZE: ${STREAMING_MAX_QUEUE_SIZE:-8}"
echo ""
echo "Paramètres TTS:"
echo "  - K4000_STREAMING_TTS: ${K4000_STREAMING_TTS:-1}"
echo "  - KYRONEX_PARALLEL_TTS: ${KYRONEX_PARALLEL_TTS:-1}"
echo "  - KYRONEX_TTS_CONCURRENCY: ${KYRONEX_TTS_CONCURRENCY:-4}"
echo "  - KYRONEX_TTS_IMMEDIATE: ${KYRONEX_TTS_IMMEDIATE:-1}"
echo ""

# Arrêter Kyronex existant
pkill -f "kyronex_server.py" 2>/dev/null || true
pkill -f "kitt_server.py" 2>/dev/null || true
sleep 1

# Démarrer Kyronex Server avec la configuration HYPER FLUID
# Note: Sur K-4000, le serveur peut s'appeler kitt_server.py
KYRONEX_ENV_FILE="$SCRIPT_DIR/kyronex_nx_8gb_hyper_fluid.env"

if [ -f "$SCRIPT_DIR/kyronex_server.py" ]; then
    SERVER_SCRIPT="$SCRIPT_DIR/kyronex_server.py"
else
    SERVER_SCRIPT="$SCRIPT_DIR/kitt_server.py"
    if [ ! -f "$SERVER_SCRIPT" ]; then
        echo -e "${RED}[ERREUR] Script serveur introuvable${NC}"
        exit 1
    fi
fi

export KYRONEX_ENV_FILE
python3 "$SERVER_SCRIPT" &

KYRONEX_PID=$!
echo -e "${GREEN}✓ kyronex_server démarré (PID: $KYRONEX_PID)${NC}"

# Attendre que le serveur soit prêt
for i in {1..30}; do
    if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Serveur Kyronex prêt après $i secondes${NC}"
        break
    fi
    sleep 1
    echo -n "."
done

if ! curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo -e "${RED}[ERREUR] Impossible de démarrer le serveur Kyronex${NC}"
    kill $LLAMA_PID 2>/dev/null
    kill $KYRONEX_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}✓ KYRONEX HYPER FLUID PRÊT !${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""
echo "Accédez à l'interface:"
echo "  - URL résolue via config/jetson_fleet.json (kitt_k4000) (K-4000)"
echo ""
echo "Pour arrêter:"
echo "  pkill -f llama-server"
echo "  pkill -f kyronex_server.py"
echo "  pkill -f kitt_server.py"
echo ""
echo "Test de streaming:"
echo "  curl -X POST http://127.0.0.1:3000/api/chat/stream \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"message\": \"Bonjour K-4000, comment ça va ?\", \"audio\": true}'"
echo ""

# Sauvegarder les PIDs
pids_file="/tmp/k4000_hyper_fluid_pids.txt"
echo "$LLAMA_PID" > "$pids_file"
echo "$KYRONEX_PID" >> "$pids_file"
echo "PIDs sauvegardés dans $pids_file"

# Log final
DATE=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$DATE] KYRONEX HYPER FLUID démarré avec succès" >> /tmp/k4000_startup.log
echo "  LLM PID: $LLAMA_PID" >> /tmp/k4000_startup.log
echo "  Kyronex PID: $KYRONEX_PID" >> /tmp/k4000_startup.log