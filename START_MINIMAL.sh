#!/bin/bash
# Démarrage MINIMAL pour tester KARR
cd /home/karr/kitt-ai

# Tuer tout
pkill -9 -f llama-server 2>/dev/null
pkill -9 -f kyronex_server 2>/dev/null
sleep 2

# Démarrer LLM
echo "Démarrage LLM..."
llama-server -m /home/karr/kitt-ai/models/qwen2.5-3b-instruct-q5_k_m.gguf \
  --host 0.0.0.0 --port 8080 --ctx-size 512 --batch-size 64 \
  --ubatch-size 64 --threads 6 --threads-batch 4 --n-gpu-layers 99 \
  --flash-attn on --load-mode mmap --no-warmup &
LLAMA_PID=$!

# Attendre LLM
for i in {1..30}; do
  if curl -s http://127.0.0.1:8080/api/health >/dev/null; then
    echo "LLM prêt en $i sec"
    break
  fi
  sleep 1
done

# Démarrer Kyronex
echo "Démarrage Kyronex..."
export KYRONEX_TTS_ENABLED=1
export KYRONEX_PARALLEL_TTS=1
export KYRONEX_TTS_CONCURRENCY=4
python3 kyronex_server.py &
KYRONEX_PID=$!

# Attendre Kyronex
for i in {1..30}; do
  if curl -s http://127.0.0.1:3000/api/health >/dev/null; then
    echo "Kyronex prêt en $i sec"
    break
  fi
  sleep 1
done

echo "PIDs: LLM=$LLAMA_PID Kyronex=$KYRONEX_PID"
echo "Test: curl -s -X POST http://127.0.0.1:3000/api/chat/stream -H 'Content-Type: application/json' -d '{"message":"test","audio":false}'"
