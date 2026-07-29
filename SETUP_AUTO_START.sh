#!/bin/bash
# ============================================================================
# SCRIPT DE CONFIGURATION POUR DÉMARRAGE AUTOMATIQUE
# Après un power off/on, TOUT sera prêt automatiquement
# ============================================================================
# Date: 2026-07-29
# Pour: Jetson Orin Nano 8Go (KARR Dadou - 192.168.129.25)
# ============================================================================

set -e

SCRIPT_DIR="/home/karr/kitt-ai"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  CONFIGURATION DÉMARRAGE AUTOMATIQUE"
echo "=========================================="
echo ""

# ============================================================================
# 1. Installer le service LLM HYPER FLUID
# ============================================================================
echo "[1/4] Installation du service LLM HYPER FLUID..."

# Copier le fichier de service
sudo cp "$SCRIPT_DIR/karr-llm-hyper-fluid.service" /etc/systemd/system/karr-llm.service

# Copier le fichier de configuration
cp "$SCRIPT_DIR/kyronex_nano_8gb_hyper_fluid.env" "$SCRIPT_DIR/kyronex.env"

# Recharger systemd
sudo systemctl daemon-reload

# Activer le service (démarrage automatique)
sudo systemctl enable karr-llm.service

# Démarrer immédiatement
sudo systemctl restart karr-llm.service

echo "✓ Service LLM HYPER FLUID installé et activé"
echo ""

# ============================================================================
# 2. Installer le service Kyronex HYPER FLUID
# ============================================================================
echo "[2/4] Installation du service Kyronex HYPER FLUID..."

# Modifier kitt-kyronex.service pour utiliser la config HYPER FLUID
sudo bash -c 'cat > /etc/systemd/system/kitt-kyronex.service << "EOF"
[Unit]
Description=Kyronex Server - Hyper Fluid Mode
After=network.target
After=karr-llm.service
Wants=karr-llm.service

[Service]
Type=simple
User=karr
WorkingDirectory=/home/karr/kitt-ai
EnvironmentFile=/home/karr/kitt-ai/kyronex_nano_8gb_hyper_fluid.env
ExecStart=/usr/bin/python3 /home/karr/kitt-ai/kyronex_server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kyronex-hyper

[Install]
WantedBy=multi-user.target
EOF'

# Recharger systemd
sudo systemctl daemon-reload

# Activer le service
sudo systemctl enable kitt-kyronex.service

# Redémarrer avec la nouvelle config
sudo systemctl restart kitt-kyronex.service

echo "✓ Service Kyronex HYPER FLUID installé et activé"
echo ""

# ============================================================================
# 3. Configurer le tunnel Cloudflare (déjà activé)
# ============================================================================
echo "[3/4] Vérification du tunnel Cloudflare..."

# Vérifier que cloudflared est installé
if ! command -v cloudflared &> /dev/null; then
    echo "⚠ cloudflared non installé, installation..."
    wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-aarch64.deb
    sudo dpkg -i cloudflared-linux-aarch64.deb
    rm cloudflared-linux-aarch64.deb
fi

# Vérifier le service tunnel
if [ -f /etc/systemd/system/cloudflared-karr-dadoo.service ]; then
    sudo systemctl enable cloudflared-karr-dadoo.service
    sudo systemctl restart cloudflared-karr-dadoo.service
    echo "✓ Tunnel Cloudflare déjà configuré et activé"
else
    echo "⚠ Service tunnel non trouvé, création..."
    sudo bash -c 'cat > /etc/systemd/system/cloudflared-karr-dadoo.service << "EOF"
[Unit]
Description=Cloudflare Tunnel for KARR Dadou
After=network.target

[Service]
Type=simple
User=karr
WorkingDirectory=/home/karr
ExecStart=/usr/bin/cloudflared tunnel --config /home/karr/.cloudflared/config.yml run karr-dadoo
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'
    sudo systemctl daemon-reload
    sudo systemctl enable cloudflared-karr-dadoo.service
    sudo systemctl start cloudflared-karr-dadoo.service
    echo "✓ Service tunnel créé et activé"
fi
echo ""

# ============================================================================
# 4. Vérification finale
# ============================================================================
echo "[4/4] Vérification finale..."

# Vérifier que les services sont actifs
echo -n "  Service LLM: "
systemctl is-active karr-llm.service 2>/dev/null && echo "✓ ACTIF" || echo "✗ INACTIF"

echo -n "  Service Kyronex: "
systemctl is-active kitt-kyronex.service 2>/dev/null && echo "✓ ACTIF" || echo "✗ INACTIF"

echo -n "  Tunnel Cloudflare: "
systemctl is-active cloudflared-karr-dadoo.service 2>/dev/null && echo "✓ ACTIF" || echo "✗ INACTIF"

echo -n "  Service LLM enabled: "
systemctl is-enabled karr-llm.service 2>/dev/null && echo "✓ OUI" || echo "✗ NON"

echo -n "  Service Kyronex enabled: "
systemctl is-enabled kitt-kyronex.service 2>/dev/null && echo "✓ OUI" || echo "✗ NON"

echo -n "  Tunnel enabled: "
systemctl is-enabled cloudflared-karr-dadoo.service 2>/dev/null && echo "✓ OUI" || echo "✗ NON"

echo ""
echo "=========================================="
echo "  CONFIGURATION TERMINÉE"
echo "=========================================="
echo ""
echo "Après un 'power off' puis 'power on':"
echo "  ✓ Le LLM démarrera automatiquement"
echo "  ✓ Kyronex démarrera automatiquement"
echo "  ✓ Le tunnel Cloudflare démarrera automatiquement"
echo ""
echo "Attendez ~30-60 secondes après le démarrage pour que tout soit prêt"
echo ""
echo "Vérification:"
echo "  curl http://127.0.0.1:8080/api/health  (LLM)"
echo "  curl http://127.0.0.1:3000/api/health  (Kyronex)"
echo "  curl https://karr-dadoo.kitt-franco-belge.be/api/health  (Tunnel)"
