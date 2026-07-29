#!/usr/bin/env bash
# Kyronext — lanceur local Jetson Orin
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$APP_DIR/.." && pwd)"
LLAMA_BUILD="$PROJECT_DIR/third_party/llama.cpp/build-kyronext"
LLAMA_SERVER="$LLAMA_BUILD/bin/llama-server"
MODEL="$APP_DIR/models/qwen2.5-3b-instruct-q5_k_m.gguf"
PYTHON="$PROJECT_DIR/.venv/bin/python"

export PATH="/usr/local/cuda/bin:$PROJECT_DIR/.venv/bin:$PATH"
export PYTHONPATH="/home/K4000/Kironext-K-4000/third_party/ctranslate2-cuda/python"
export LD_LIBRARY_PATH="/home/K4000/Kironext-K-4000/third_party/ctranslate2-cuda/lib:/usr/local/cuda/targets/sbsa-linux/lib:/lib/aarch64-linux-gnu:/home/K4000/Kironext-K-4000/third_party/llama.cpp/build-kyronext/bin:/home/K4000/Kironext-K-4000/third_party/llama.cpp/build-kyronext/ggml/src"
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
export KYRONEXT_WHISPER_MODEL="/home/K4000/Kironext-K-4000/app/models/whisper-small"
export KYRONEXT_WHISPER_DEVICE="cuda"
export KYRONEXT_WHISPER_COMPUTE_TYPE="int8_float16"
export KYRONEXT_WHISPER_PRELOAD="1"

cleanup() {
    trap - EXIT INT TERM
    [[ -n "${APP_PID:-}" ]] && kill "$APP_PID" 2>/dev/null || true
    [[ -n "${LLM_PID:-}" ]] && kill "$LLM_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for required in "$LLAMA_SERVER" "$MODEL" "$PYTHON"; do
    if [[ ! -e "$required" ]]; then
        echo "ERREUR: composant introuvable: $required" >&2
        exit 1
    fi
done

echo "============================================================"
echo "  KYRONEXT — IA vocale locale K4000"
echo "============================================================"

"$LLAMA_SERVER" \
    --model "$MODEL" \
    --host 127.0.0.1 \
    --port 8080 \
    --n-gpu-layers 99 \
    --ctx-size 2048 \
    --parallel 1 \
    --batch-size 512 \
    --ubatch-size 512 \
    --threads 4 \
    --threads-batch 4 \
    --flash-attn on \
    --cont-batching &
LLM_PID=$!

echo "[...] Attente du LLM (PID $LLM_PID)..."
llm_ready=0
for _ in $(seq 1 120); do
    if ! kill -0 "$LLM_PID" 2>/dev/null; then
        echo "ERREUR: llama-server s'est arrêté pendant le démarrage" >&2
        wait "$LLM_PID"
        exit 1
    fi
    if curl --fail --silent http://127.0.0.1:8080/health | grep -q "ok"; then
        llm_ready=1
        break
    fi
    sleep 1
done
if [[ "$llm_ready" -ne 1 ]]; then
    echo "ERREUR: llama-server non prêt après 120 secondes" >&2
    exit 1
fi

echo "[OK] LLM prêt; démarrage de Kyronext..."
cd "$APP_DIR"
"$PYTHON" kitt_server.py &
APP_PID=$!

IP="$(hostname -I | awk '{print $1}')"
echo "[OK] Interface: https://${IP:-127.0.0.1}:3000 (PID $APP_PID)"
wait "$APP_PID"
