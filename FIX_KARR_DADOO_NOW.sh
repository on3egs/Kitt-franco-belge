#!/bin/bash
# SCRIPT DE FIX IMMÉDIAT POUR KARR DADOO
# Exécute ce script SUR la machine 192.168.129.25 (KARR Dadou)
# Résout le problème : "écoute et transcrit mais ne répond pas"

set -e
set -o pipefail

echo "=========================================="
echo "  FIX IMMÉDIAT - KARR DADOO"
echo "  Résolution: TTS + LLM HYPER FLUID"
echo "=========================================="
echo ""

SCRIPT_DIR="/home/karr/kitt-ai"
cd "$SCRIPT_DIR"

# Arrêter TOUS les services existants
echo "[1/5] Arrêt des anciens services..."
pkill -f "llama-server" 2>/dev/null || true
pkill -f "kyronex_server" 2>/dev/null || true
pkill -f "kitt_server" 2>/dev/null || true
sleep 2

# Tuer les processus résiduels
pkill -9 -f "llama-server" 2>/dev/null || true
pkill -9 -f "kyronex_server" 2>/dev/null || true
pkill -9 -f "kitt_server" 2>/dev/null || true
sleep 1

echo "✓ Anciens services arrêtés"
echo ""

# Vérifier le modèle Qwen 2.5 3B
echo "[2/5] Vérification du modèle LLM..."
MODEL="/home/karr/kitt-ai/models/qwen2.5-3b-instruct-q5_k_m.gguf"
if [ ! -f "$MODEL" ]; then
    echo "✗ Modèle introuvable: $MODEL"
    echo "  Essai avec le modèle par défaut..."
    MODEL="/home/karr/kitt-ai/models/qwen2.5-3b-instruct-q5_k_m.gguf"
    if [ ! -f "$MODEL" ]; then
        echo "✗ Modèle toujours introuvable !"
        exit 1
    fi
fi
echo "✓ Modèle trouvé: $MODEL"
echo ""

# Démarrer llama-server avec configuration HYPER FLUID
echo "[3/5] Démarrage de llama-server (Qwen 2.5 3B HYPER FLUID)..."
LLAMA_SERVER="/home/karr/kitt-ai/llama.cpp_build/bin/llama-server"

$LLAMA_SERVER \
  -m "$MODEL" \
  --host 0.0.0.0 \
  --port 8080 \
  --ctx-size 512 \
  --batch-size 64 \
  --ubatch-size 64 \
  --threads 6 \
  --threads-batch 4 \
  --n-gpu-layers 99 \
  --flash-attn on \
  --load-mode mmap \
  --no-warmup &

LLAMA_PID=$!
echo "✓ llama-server démarré (PID: $LLAMA_PID)"

# Attendre que le LLM soit prêt
for i in {1..30}; do
    if curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
        echo "✓ LLM prêt après $i secondes"
        break
    fi
    sleep 1
    echo -n "."
done

if ! curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
    echo "✗ Échec du démarrage LLM !"
    kill $LLAMA_PID 2>/dev/null
    exit 1
fi
echo ""

# Démarrer kyronex_server avec configuration HYPER FLUID
echo "[4/5] Démarrage de kyronex_server (TTS PARALLÈLE activé)..."

# Forcer le chargement des nouvelles variables
export KYRONEX_TTS_ENABLED=1
export KYRONEX_TTS_DEVICE=cuda
export KYRONEX_PARALLEL_TTS=1
export KYRONEX_TTS_CONCURRENCY=4
export KYRONEX_TTS_IMMEDIATE=1
export STREAMING_MIN_WORDS=1
export STREAMING_MIN_CHARS=3
export STREAMING_MAX_DELAY_MS=40
export STREAMING_MAX_QUEUE_SIZE=8
export KYRONEX_WHISPER_PRELOAD=1

echo "  Paramètres: TTS=$KYRONEX_TTS_ENABLED, PARALLEL=$KYRONEX_PARALLEL_TTS, STREAMING_MIN_WORDS=$STREAMING_MIN_WORDS"

# Arrêter kyronex existant
pkill -f "kyronex_server.py" 2>/dev/null || true
sleep 1

# Démarrer avec Python
python3 "$SCRIPT_DIR/kyronex_server.py" &

KYRONEX_PID=$!
echo "✓ kyronex_server démarré (PID: $KYRONEX_PID)"

# Attendre que le serveur soit prêt
for i in {1..30}; do
    if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
        echo "✓ Kyronex prêt après $i secondes"
        break
    fi
    sleep 1
    echo -n "."
done

if ! curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "✗ Échec du démarrage Kyronex !"
    kill $LLAMA_PID 2>/dev/null
    kill $KYRONEX_PID 2>/dev/null
    exit 1
fi
echo ""

# Test immédiat
echo "[5/5] Test immédiat..."
echo -n "  Envoi d'un message test... "
RESPONSE=$(curl -s -m 10 \
  -X POST http://127.0.0.1:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Bonjour KARR, tu m entends ?", "audio": false}' \
  2>/dev/null | head -c 500)

if echo "$RESPONSE" | grep -q "token"; then
    echo "✓ KARR RÉPOND !"
    echo ""
    echo "Réponse reçu:"
    echo "$RESPONSE" | grep -o '"token":[^,]*' | head -5
else
    echo "✗ Pas de réponse"
    echo "Réponse brute: $RESPONSE"
fi

echo ""
echo "=========================================="
echo "  FIX TERMINÉ"
echo "=========================================="
echo ""
echo "Si KARR répond mais pas vocalement:"
echo "  Vérifiez que KYRONEX_TTS_ENABLED=1"
echo "  Vérifiez que Piper est installé"
echo ""
echo "PIDs:"
echo "  LLM: $LLAMA_PID"
echo "  Kyronex: $KYRONEX_PID"
