#!/bin/bash

# Script complet pour démarrer KARR DE DADOO avec LLM CPU
# À exécuter après reboot ou manuellement

set -e

echo "=========================================="
echo "  Démarrage KARR DE DADOO - JETSON NX 8GB"
echo "=========================================="

# 1. Arrêter les anciens processus
echo "[1/5] Nettoyage des anciens processus..."
pkill -9 ollama 2>/dev/null || true
pkill -9 -f "llama-server" 2>/dev/null || true
pkill -9 -f kyronex_server 2>/dev/null || true
pkill -9 -f serveo 2>/dev/null || true
sleep 3

# 2. Démarrer Ollama en mode CPU sur le port 11435
echo "[2/5] Démarrage Ollama (CPU-only, port 11435)..."
CUDA_VISIBLE_DEVICES="" \
OLLAMA_HOST="127.0.0.1:11435" \
OLLAMA_ORIGINS="*" \
OLLAMA_LLM_LIBRARY="cpu" \
OLLAMA_MAX_LOADED_MODELS=1 \
LD_LIBRARY_PATH="" \
NVIDIA_VISIBLE_DEVICES="" \
NVIDIA_DRIVER_CAPABILITIES="" \
/usr/local/bin/ollama serve > /tmp/ollama_cpu.log 2>&1 &

# Attendre que Ollama soit prêt
echo "[3/5] Attente Ollama..."
for i in {1..30}; do
    if curl -s http://localhost:11435/api/tags > /dev/null 2>&1; then
        echo "    ✓ Ollama prêt sur port 11435"
        break
    fi
    sleep 2
    echo "    Attente... ($i/30)"
done

# 3. Charger le modèle gemma:2b si pas déjà chargé
echo "[4/5] Chargement du modèle gemma:2b..."
if ! curl -s http://localhost:11435/api/tags | grep -q gemma:2b; then
    echo "    Chargement de gemma:2b..."
    CUDA_VISIBLE_DEVICES="" ollama pull gemma:2b > /tmp/ollama_pull.log 2>&1
    echo "    ✓ Modèle gemma:2b chargé"
else
    echo "    ✓ Modèle déjà chargé"
fi

# 4. Démarrer le serveur Kyronex
echo "[5/5] Démarrage Kyronex Server..."
cd /home/karr/kitt-ai
nohup /home/karr/kitt-ai/venv/bin/python3 kyronex_server.py > /tmp/kyronex_server.log 2>&1 &

# Attendre que le serveur soit prêt
echo "    Attente serveur..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "    ✓ Kyronex Server prêt sur port 3001"
        break
    fi
    sleep 2
    echo "    Attente... ($i/30)"
done

# 5. Démarrer le tunnel serveo.net
echo "[6/5] Démarrage tunnel serveo.net..."
pkill -9 -f "ssh.*serveo" 2>/dev/null || true
sleep 1
nohup ssh -o ServerAliveInterval=60 -o StrictHostKeyChecking=no -R 80:localhost:3001 serveo.net > /tmp/serveo.log 2>&1 &

for i in {1..15}; do
    if grep -q "Forwarding HTTP traffic" /tmp/serveo.log 2>/dev/null; then
        URL=$(grep "Forwarding HTTP traffic from" /tmp/serveo.log | grep -oP 'https://[a-zA-Z0-9\-_.]+\.serveousercontent\.com')
        echo "    ✓ Tunnel actif : $URL"
        echo "$URL" > /tmp/current_tunnel_url.txt
        break
    fi
    sleep 2
    echo "    Attente tunnel... ($i/15)"
done

echo ""
echo "=========================================="
echo "  ✓ KARR DE DADOO EST PRÊT !"
echo "=========================================="
echo ""
echo "Accès local :"
echo "  - HTTP  : http://localhost:3001"
echo "  - HTTPS : https://localhost:3000"
echo ""
echo "Accès internet :"
cat /tmp/current_tunnel_url.txt 2>/dev/null || echo "  Tunnel : https://fe2b0429f91ad2e3-217-136-30-166.serveousercontent.com"
echo ""
echo "Test :"
echo "  curl http://localhost:3001/api/health"
echo ""
