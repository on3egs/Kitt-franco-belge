#!/bin/bash
# Kyronext Studio - Installateur Linux x86_64
# Copyright 2026 - Manix (Emmanuel Gelinne)
# Pour KITT Franco-Belge

set -euo pipefail

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher avec couleur
echo_error() {
    echo -e "${RED}[ERREUR]${NC} $1" >&2
}
echo_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}
echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}
echo_warn() {
    echo -e "${YELLOW}[ATTENTION]${NC} $1"
}

# Vérification des droits root
if [ "$(id -u)" -ne 0 ]; then
    echo_error "Ce script doit être exécuté avec sudo ou en tant que root"
    exit 1
fi

# Répertoire d'installation
INSTALL_DIR="/opt/KyronextStudio"
DESKTOP_FILE="/usr/share/applications/kyronext-studio.desktop"

# Créer le répertoire
echo_info "Création du répertoire d'installation..."
mkdir -p "$INSTALL_DIR"

# Détecter l'architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
    echo_warn "Ce script est conçu pour x86_64. Architecture détectée: $ARCH"
fi

# Installer les dépendances nécessaires
echo_info "Installation des dépendances..."
if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y python3 python3-pip python3-venv git wget curl ffmpeg libopenblas-dev libatlas-base-dev
elif command -v dnf &> /dev/null; then
    dnf install -y python3 python3-pip python3-virtualenv git wget curl ffmpeg openblas atlas
elif command -v yum &> /dev/null; then
    yum install -y python3 python3-pip python3-virtualenv git wget curl ffmpeg openblas atlas
else
    echo_error "Gestionnaire de paquets non reconnu. Installation manuelle requise."
    exit 1
fi

# Cloner le dépôt Kyronext Studio
echo_info "Téléchargement de Kyronext Studio..."
if [ -d "$INSTALL_DIR/KyronextStudio" ]; then
    echo_info "Mise à jour du dépôt existant..."
    cd "$INSTALL_DIR/KyronextStudio"
    git pull origin master
else
    git clone -b master https://github.com/on3egs/Kitt-franco-belge.git "$INSTALL_DIR/KyronextStudio"
fi

# Installer les dépendances Python
echo_info "Installation des dépendances Python..."
cd "$INSTALL_DIR/KyronextStudio"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt 2>/dev/null || echo_warn "Pas de fichier requirements.txt trouvé"

# Créer un fichier desktop pour le menu
echo_info "Création de l'entrée menu..."
cat > "$DESKTOP_FILE" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Kyronext Studio
Comment=Studio audio pour KYRONEX - Gestion de médias locaux
Exec=/opt/KyronextStudio/KyronextStudio/kyronext-studio.py
Icon=/opt/KyronextStudio/KyronextStudio/assets/kyronext-icon.png
Terminal=true
Categories=AudioVideo;Audio;Music;
Encoding=UTF-8
EOF

# Rendre exécutable
chmod +x "$DESKTOP_FILE"

# Créer un script de lancement
echo_info "Création du script de lancement..."
cat > /usr/local/bin/kyronext-studio << 'EOF'
#!/bin/bash
cd /opt/KyronextStudio/KyronextStudio
source venv/bin/activate
python3 kyronext-studio.py
EOF
chmod +x /usr/local/bin/kyronext-studio

# Créer un lien symbolique dans /usr/bin
ln -sf /usr/local/bin/kyronext-studio /usr/bin/kyronext-studio 2>/dev/null || true

# Configurer les permissions
chown -R root:root "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"

echo_success "Installation terminée !"
echo ""
echo "Pour lancer Kyronext Studio:"
echo "  - Depuis le menu des applications"
echo "  - Ou en ligne de commande: kyronext-studio"
echo ""
echo_warn "Veuillez redémarrer votre session pour que les changements prennent effet."
