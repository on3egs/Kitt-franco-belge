#!/bin/bash
# ============================================================================
# SCRIPT DE DÉMARRAGE AUTOMATIQUE HYPER FLUID
# Ce script démarre TOUT automatiquement au boot
# ============================================================================
# Date: 2026-07-29
# Pour: Jetson Orin Nano 8Go (KARR Dadou)
# ============================================================================

SCRIPT_DIR="/home/karr/kitt-ai"
cd "$SCRIPT_DIR"

# ============================================================================
# Démarrer LLM (Qwen 2.5 3B)
# ============================================================================
echo "[LLM] Démarrage de llama-server..."

# Tuer les anciens processus
pkill -9 -f "llama-server" 2>/dev/null || true
pkill -9 -f "a-server" 2>/dev/null || true
sleep 2

# Démarrer avec nohup pour survivre à la déconnexion
nohup /home/karr/kitt-ai/llama.cpp_build/bin/llama-server \
  -m /home/karr/kitt-ai/models/qwen2.5-3b-instruct-q5_k_m.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  --ctx-size 2048 \
  --parallel 1 \
  --batch-size 64 \
  --ubatch-size 64 \
  --threads 6 \
  --threads-batch 4 \
  --n-gpu-layers 99 \
  --flash-attn on \
  --load-mode mmap \
  --no-warmup \
  > /tmp/llama_server.log 2>&1 &

LLAMA_PID=$!
echo "[LLM] Démarré (PID: $LLAMA_PID)"

# Attendre que LLM soit prêt (max 60s)
for i in {1..60}; do
    if curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
        echo "[LLM] Prêt après $i secondes"
        break
    fi
    sleep 1
done

if ! curl -s http://127.0.0.1:8080/api/health > /dev/null 2>&1; then
    echo "[LLM] ÉCHEC: Impossible de démarrer"
    exit 1
fi

# ============================================================================
# Démarrer Kyronex Server
# ============================================================================
echo "[KYRONEX] Démarrage du serveur..."

# Tuer les anciens processus
pkill -9 -f "kyronex_server" 2>/dev/null || true
pkill -9 -f "kitt_server" 2>/dev/null || true
sleep 2

# Exporter les variables d'environnement HYPER FLUID
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

# Démarrer avec nohup
nohup /usr/bin/python3 /home/karr/kitt-ai/kyronex_server.py \
  > /tmp/kyronex_server.log 2>&1 &

KYRONEX_PID=$!
echo "[KYRONEX] Démarré (PID: $KYRONEX_PID)"

# Attendre que Kyronex soit prêt (max 60s)
for i in {1..60}; do
    if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
        echo "[KYRONEX] Prêt après $i secondes"
        break
    fi
    sleep 1
done

if ! curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "[KYRONEX] ÉCHEC: Impossible de démarrer"
    exit 1
fi

# ============================================================================
# Démarrer Tunnel Cloudflare
# ============================================================================
echo "[TUNNEL] Démarrage de cloudflared..."

# Tuer les anciens tunnels
pkill -9 -f "cloudflared" 2>/dev/null || true
sleep 1

# Démarrer le tunnel
if [ -f /home/karr/.cloudflared/config.yml ]; then
    nohup /usr/bin/cloudflared tunnel --config /home/karr/.cloudflared/config.yml run karr-dadoo \
      > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    echo "[TUNNEL] Démarré (PID: $TUNNEL_PID)"
    sleep 3
    
    # Vérifier que le tunnel fonctionne
    for i in {1..10}; do
        if curl -s -m 5 https://karr-dadoo.kitt-franco-belge.be/api/health > /dev/null 2>&1; then
            echo "[TUNNEL] Prêt après $i secondes"
            break
        fi
        sleep 5
    done
else
    echo "[TUNNEL] Fichier config.yml non trouvé, tunnel non démarré"
fi

# ============================================================================
# Résumé
# ============================================================================
echo ""
echo "=========================================="
echo "  TOUT EST PRÊT !"
echo "=========================================="
echo ""
echo "Services démarrés:"
echo "  - LLM:        PID $LLAMA_PID (port 8080)"
echo "  - Kyronex:   PID $KYRONEX_PID (port 3000)"
if [ -n "$TUNNEL_PID" ]; then
    echo "  - Tunnel:     PID $TUNNEL_PID (https://karr-dadoo.kitt-franco-belge.be)"
fi
echo ""
echo "Vérification:"
echo "  curl http://127.0.0.1:8080/api/health"
echo "  curl http://127.0.0.1:3000/api/health"
echo "  curl https://karr-dadoo.kitt-franco-belge.be/api/health"
