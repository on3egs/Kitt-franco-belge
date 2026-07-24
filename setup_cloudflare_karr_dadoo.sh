#!/bin/bash
# Script pour configurer le tunnel Cloudflare sur 192.168.129.25 (KARR DE DADOO)
# À exécuter sur 192.168.129.25 avec les droits root ou sudo

set -e

echo "=== Configuration du tunnel Cloudflare pour KARR DE DADOO ==="

# 1. Installer cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "Installation de cloudflared..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -O /tmp/cloudflared.deb
    dpkg -i /tmp/cloudflared.deb || apt-get install -y -f /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
else
    echo "cloudflared est déjà installé"
fi

# 2. Vérifier la version
cloudflared --version

# 3. Créer le répertoire .cloudflared
mkdir -p ~/.cloudflared

# 4. Créer un nouveau tunnel (il faudra authentifier avec Cloudflare)
# Note: Cette étape nécessite une authentification manuelle
if [ ! -f ~/.cloudflared/cert.pem ]; then
    echo "Authentification avec Cloudflare..."
    cloudflared tunnel login
else
    echo "Déjà authentifié avec Cloudflare"
fi

# 5. Créer un nouveau tunnel
TUNNEL_NAME="karr-dadoo"
TUNNEL_ID=$(cloudflared tunnel create $TUNNEL_NAME 2>/dev/null || echo "")

if [ -z "$TUNNEL_ID" ]; then
    echo "Erreur: Impossible de créer le tunnel. Vérifiez l'authentification."
    exit 1
fi

echo "Tunnel créé: $TUNNEL_ID"

# 6. Configurer le tunnel
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd
credentials-file: /home/karr/.cloudflared/a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd.json
ingress:
  - hostname: karr-dadoo.kitt-franco-belge.be
    service: http://localhost:3001
  - service: http_status:404
EOF

# Remplacer le tunnel ID avec celui généré
sed -i "s/a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd/$TUNNEL_ID/" ~/.cloudflared/config.yml

# 7. Configurer les credentials
# Le fichier credentials sera créé lors de la première exécution

# 8. Tester le tunnel
cloudflared --no-autoupdate --config ~/.cloudflared/config.yml tunnel run $TUNNEL_NAME &

# 9. Attendre que le tunnel soit prêt
sleep 5

# 10. Vérifier les logs
cloudflared --config ~/.cloudflared/config.yml tunnel info $TUNNEL_NAME

echo "=== Configuration terminée ==="
echo "Pour démarrer le tunnel au démarrage, créez un service systemd ou ajoutez la commande à votre rc.local"
echo "Exemple de service systemd:"
cat << 'EOF'
[Unit]
Description=Cloudflare Tunnel for KARR DADOO
After=network.target

[Service]
Type=simple
User=karr
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config /home/karr/.cloudflared/config.yml tunnel run karr-dadoo
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "Pour activer le service:"
echo "sudo cp /path/to/cloudflared-karr-dadoo.service /etc/systemd/system/"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable cloudflared-karr-dadoo"
echo "sudo systemctl start cloudflared-karr-dadoo"
