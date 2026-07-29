#!/bin/bash
# ============================================================================
# CONFIGURATION DU DÉMARRAGE AUTOMATIQUE AU BOOT
# Après un 'sudo poweroff' puis 'power on', TOUT sera prêt automatiquement
# ============================================================================
# Date: 2026-07-29
# Pour: Jetson Orin Nano 8Go (KARR Dadou - 192.168.129.25)
# ============================================================================

set -e

SCRIPT_DIR="/home/karr/kitt-ai"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  CONFIGURATION DU BOOT AUTOMATIQUE"
echo "=========================================="
echo ""

# ============================================================================
# 1. Créer le script de démarrage
# ============================================================================
echo "[1/5] Création du script de démarrage..."

# Le script existe déjà (startup_hyper_fluid.sh)
if [ ! -f "$SCRIPT_DIR/startup_hyper_fluid.sh" ]; then
    echo "✗ Script de démarrage introuvable !"
    exit 1
fi

chmod +x "$SCRIPT_DIR/startup_hyper_fluid.sh"
echo "✓ Script créé et rendu exécutable"
echo ""

# ============================================================================
# 2. Configurer crontab pour démarrage au boot
# ============================================================================
echo "[2/5] Configuration de crontab @reboot..."

# Ajouter au crontab de root (pour les commandes system)
if ! crontab -l 2>/dev/null | grep -q "startup_hyper_fluid"; then
    (crontab -l 2>/dev/null; echo "@reboot /home/karr/kitt-ai/startup_hyper_fluid.sh") | crontab -
    echo "✓ crontab configuré pour root"
else
    echo "✓ crontab déjà configuré pour root"
fi

# Ajouter aussi au crontab de karr (au cas où)
if ! sudo -u karr crontab -l 2>/dev/null | grep -q "startup_hyper_fluid"; then
    (sudo -u karr crontab -l 2>/dev/null; echo "@reboot /home/karr/kitt-ai/startup_hyper_fluid.sh") | sudo -u karr crontab -
    echo "✓ crontab configuré pour karr"
else
    echo "✓ crontab déjà configuré pour karr"
fi

echo ""

# ============================================================================
# 3. Configurer le service systemd (fallback)
# ============================================================================
echo "[3/5] Configuration du service systemd (backup)..."

# Désactiver l'ancien service karr-llm.service qui pose problème
sudo systemctl disable karr-llm.service 2>/dev/null || true

# Créer un service simple qui appelle notre script
sudo bash -c 'cat > /etc/systemd/system/karr-hyper-fluid.service << "EOF"
[Unit]
Description=KARR HYPER FLUID - Démarrage complet
After=network.target
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/karr/kitt-ai/startup_hyper_fluid.sh
User=root
WorkingDirectory=/home/karr/kitt-ai

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable karr-hyper-fluid.service
sudo systemctl start karr-hyper-fluid.service

echo "✓ Service systemd de backup configuré"
echo ""

# ============================================================================
# 4. Configurer le tunnel Cloudflare
# ============================================================================
echo "[4/5] Configuration du tunnel Cloudflare..."

# Vérifier que cloudflared est installé
if ! command -v cloudflared &> /dev/null; then
    echo "⚠ cloudflared non installé"
    echo "  Installation: wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-aarch64.deb && sudo dpkg -i cloudflared-linux-aarch64.deb"
else
    echo "✓ cloudflared est installé"
fi

# Vérifier que le service tunnel existe et est activé
if [ -f /etc/systemd/system/cloudflared-karr-dadoo.service ]; then
    sudo systemctl enable cloudflared-karr-dadoo.service
    sudo systemctl start cloudflared-karr-dadoo.service
    echo "✓ Service tunnel configuré"
else
    echo "⚠ Service tunnel non trouvé"
fi

echo ""

# ============================================================================
# 5. Vérification finale
# ============================================================================
echo "[5/5] Vérification de la configuration..."

# Vérifier crontab root
echo -n "  crontab root: "
if crontab -l 2>/dev/null | grep -q "startup_hyper_fluid"; then
    echo "✓ CONFIGURÉ"
else
    echo "✗ NON CONFIGURÉ"
fi

# Vérifier crontab karr
echo -n "  crontab karr: "
if sudo -u karr crontab -l 2>/dev/null | grep -q "startup_hyper_fluid"; then
    echo "✓ CONFIGURÉ"
else
    echo "✗ NON CONFIGURÉ"
fi

# Vérifier service systemd
echo -n "  Service systemd: "
if systemctl is-enabled karr-hyper-fluid.service 2>/dev/null; then
    echo "✓ ACTIVÉ"
else
    echo "✗ NON ACTIVÉ"
fi

# Vérifier tunnel
echo -n "  Service tunnel: "
if [ -f /etc/systemd/system/cloudflared-karr-dadoo.service ] && systemctl is-enabled cloudflared-karr-dadoo.service 2>/dev/null; then
    echo "✓ ACTIVÉ"
else
    echo "✗ NON ACTIVÉ"
fi

echo ""
echo "=========================================="
echo "  CONFIGURATION TERMINÉE"
echo "=========================================="
echo ""
echo "Après un 'sudo poweroff' puis 'power on':"
echo ""
echo "  ✓ crontab @reboot exécutera /home/karr/kitt-ai/startup_hyper_fluid.sh"
echo "  ✓ Le service systemd karr-hyper-fluid.service démarrera aussi"
echo "  ✓ Tout sera prêt en ~60-90 secondes"
echo ""
echo "Pour tester maintenant:"
echo "  sudo /home/karr/kitt-ai/startup_hyper_fluid.sh"
echo ""
echo "Pour vérifier après reboot:"
echo "  curl http://127.0.0.1:8080/api/health"
echo "  curl http://127.0.0.1:3000/api/health"
echo "  curl https://karr-dadoo.kitt-franco-belge.be/api/health"
echo ""
echo "Logs:"
echo "  tail -f /tmp/llama_server.log"
echo "  tail -f /tmp/kyronex_server.log"
echo "  tail -f /tmp/cloudflared.log"
