# Configuration du Tunnel Cloudflare pour KARR DE DADOO (192.168.129.25)

## Contexte
- **192.168.129.23 (KARR)** : Tunnel Cloudflare **FONCTIONNE** ✅
  - Configuration : `/home/karr/.cloudflared/config.yml`
  - Tunnel ID : `a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd`
  - Ingress : `karr.kitt-franco-belge.be → http://localhost:3001`
  - Service : `cloudflared --no-autoupdate --config /home/karr/.cloudflared/config.yml tunnel run karr`
  - Version : 2026.5.2

- **192.168.129.25 (KARR DE DADOO)** : Tunnel Cloudflare **NE FONCTIONNE PAS** ❌
  - Service web : écoute sur **port 3001** (pas 3000 !)
  - SSH : accessible mais authentification échouée
  - Cloudflared : **non installé**

---

## Problèmes Identifiés

1. **Mauvais port dans tunnel_karr_dadoo.json**
   - Actuel : `http://192.168.129.25:3000` ❌
   - Corrigé : `http://192.168.129.25:3001` ✅

2. **Pas de tunnel Cloudflare configuré sur 192.168.129.25**
   - cloudflared n'est pas installé
   - Aucune configuration de tunnel
   - Pas de service système

3. **Accès SSH limité**
   - Le SSH est actif sur le port 22
   - Mais les clés actuelles ne sont pas autorisées
   - Nécessite d'ajouter une clé SSH valide

---

## Étapes pour Résoudre

### Étape 1 : Ajouter une Clé SSH sur 192.168.129.25

Depuis une machine avec accès (comme 192.168.129.23 ou K2000) :

```bash
# Sur une machine avec accès SSH
ssh-copy-id -i ~/.ssh/id_rsa_kimi.pub karr@192.168.129.25

# Ou manuellement :
cat ~/.ssh/id_rsa_kimi.pub | ssh karr@192.168.129.25 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**Note** : Si aucune clé ne fonctionne, il faudra :
- Soit connaître le mot de passe du compte `karr` sur 192.168.129.25
- Soit utiliser une session console physique sur 192.168.129.25 pour ajouter manuellement la clé

---

### Étape 2 : Installer cloudflared sur 192.168.129.25

Une fois l'accès SSH établi, exécuter :

```bash
# Télécharger et installer cloudflared (ARM64 pour Jetson)
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -O /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb || sudo apt-get install -y -f /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

# Vérifier l'installation
cloudflared --version
```

---

### Étape 3 : Authentifier cloudflared avec Cloudflare

```bash
# Se connecter à Cloudflare (nécessite une session interactive)
cloudflared tunnel login

# Suivre les instructions pour autoriser l'accès au compte Cloudflare
```

---

### Étape 4 : Créer un Nouveau Tunnel

```bash
# Créer le tunnel
TUNNEL_NAME="karr-dadoo"
TUNNEL_ID=$(cloudflared tunnel create $TUNNEL_NAME)
echo "Nouveau Tunnel ID: $TUNNEL_ID"
```

---

### Étape 5 : Configurer le Tunnel

```bash
# Créer le répertoire de configuration
mkdir -p ~/.cloudflared

# Créer le fichier config.yml (remplacer TUNNEL_ID par l'ID généré)
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /home/karr/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: karr-dadoo.kitt-franco-belge.be
    service: http://localhost:3001
  - service: http_status:404
EOF

# Créer le fichier credentials (sera généré automatiquement si non existant)
# Sinon, copier depuis 192.168.129.23 et adapter :
# scp karr@192.168.129.23:.cloudflared/a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd.json ~/.cloudflared/$TUNNEL_ID.json
```

**Important** : 
- Le **hostname** doit être un sous-domaine configuré dans Cloudflare DNS
- Le **service** doit pointer vers `http://localhost:3001` (pas 3000 !)

---

### Étape 6 : Configurer le DNS dans Cloudflare

1. Aller sur [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Sélectionner le domaine `kitt-franco-belge.be`
3. Ajouter un enregistrement CNAME :
   - **Type** : CNAME
   - **Name** : `karr-dadoo`
   - **Target** : `<TUNNEL_ID>.cfargotunnel.com`
   - **Proxy status** : Proxied (orange cloud) ✅

---

### Étape 7 : Démarrer le Tunnel

```bash
# Tester le tunnel
cloudflared --no-autoupdate --config ~/.cloudflared/config.yml tunnel run $TUNNEL_NAME

# Vérifier que le tunnel est actif
cloudflared --config ~/.cloudflared/config.yml tunnel info $TUNNEL_NAME
```

---

### Étape 8 : Créer un Service Systemd (Optionnel mais Recommandé)

```bash
# Créer le fichier de service
sudo bash -c 'cat > /etc/systemd/system/cloudflared-karr-dadoo.service << EOF
[Unit]
Description=Cloudflare Tunnel for KARR DADOO
After=network.target

[Service]
Type=simple
User=karr
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config /home/karr/.cloudflared/config.yml tunnel run karr-dadoo
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'

# Activer et démarrer le service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared-karr-dadoo
sudo systemctl start cloudflared-karr-dadoo

# Vérifier le statut
sudo systemctl status cloudflared-karr-dadoo
```

---

### Étape 9 : Mettre à Jour tunnel_karr_dadoo.json

Une fois le tunnel Cloudflare configuré et le hostname `karr-dadoo.kitt-franco-belge.be` opérationnel :

```bash
# Mettre à jour le fichier tunnel_karr_dadoo.json
# Remplacer l'URL locale par l'URL Cloudflare
```

Le fichier doit contenir :
```json
{
    "status": "online",
    "url": "https://karr-dadoo.kitt-franco-belge.be",
    "last_update": "2026-07-24T00:00:00+00:00",
    "host": "karr-nano-dadoo",
    "version": "1.0",
    "permanent": true,
    "note": "KARR De Dadoo - JETSON NANO ORIN NX 8GB"
}
```

---

## Commandes de Vérification

### Sur 192.168.129.25

```bash
# Vérifier que le service écoute sur le port 3001
ss -tulnp | grep 3001

# Vérifier que cloudflared est en cours d'exécution
ps aux | grep cloudflared

# Vérifier les logs du tunnel
journalctl -u cloudflared-karr-dadoo -f

# Tester la connexion locale
curl -v http://localhost:3001

# Tester la connexion via Cloudflare (une fois configuré)
curl -v https://karr-dadoo.kitt-franco-belge.be
```

### Depuis une autre machine

```bash
# Tester l'accès au service web localement
curl -v http://192.168.129.25:3001

# Tester l'accès via Cloudflare (une fois configuré)
curl -v https://karr-dadoo.kitt-franco-belge.be
```

---

## Comparaison des Configurations

| Paramètre | 192.168.129.23 (KARR) ✅ | 192.168.129.25 (KARR DADOO) ❌ | Action Requise |
|----------|--------------------------------|----------------------------------|----------------|
| cloudflared installé | ✅ v2026.5.2 | ❌ Non installé | Installer cloudflared |
| Répertoire .cloudflared | ✅ /home/karr/.cloudflared | ❌ Non existant | Créer répertoire |
| Tunnel ID | a4a604f1-55f2-4e25-b00d-1ed6a91f4dbd | ❌ Aucun | Créer nouveau tunnel |
| Ingress hostname | karr.kitt-franco-belge.be | ❌ Aucun | Configurer karr-dadoo.kitt-franco-belge.be |
| Service local | http://localhost:3001 | ✅ http://localhost:3001 | OK (mais port 3000 → 3001 corrigé) |
| Fichier credentials | ✅ présent | ❌ Non existant | Créer/générer |
| Service systemd | ❌ (démarré manuellement) | ❌ Non existant | Créer service |
| SSH accessible | ✅ | ✅ (port 22) | Autoriser clé SSH |

---

## Résumé des Actions Correctives

1. ✅ **Corrigé** : Port dans tunnel_karr_dadoo.json changé de 3000 à 3001
2. ⏳ **À faire** : Ajouter une clé SSH autorisée sur 192.168.129.25
3. ⏳ **À faire** : Installer cloudflared sur 192.168.129.25
4. ⏳ **À faire** : Authentifier cloudflared avec Cloudflare
5. ⏳ **À faire** : Créer un nouveau tunnel pour KARR DADOO
6. ⏳ **À faire** : Configurer l'ingress vers http://localhost:3001
7. ⏳ **À faire** : Configurer le DNS Cloudflare (karr-dadoo.kitt-franco-belge.be)
8. ⏳ **À faire** : Démarrer le tunnel (manuel ou via systemd)
9. ⏳ **À faire** : Mettre à jour tunnel_karr_dadoo.json avec l'URL Cloudflare

---

## Preuves de Fonctionnement (Une fois Configuré)

```bash
# Depuis cette machine ou 192.168.129.23
curl -I https://karr-dadoo.kitt-franco-belge.be
# Devrait retourner : HTTP/2 200

# Vérifier le statut du tunnel
ssh karr@192.168.129.25 "cloudflared tunnel info karr-dadoo"
# Devrait afficher : Tunnel ID, Connector ID, etc.

# Vérifier le service systemd
ssh karr@192.168.129.25 "systemctl status cloudflared-karr-dadoo"
# Devrait afficher : active (running)
```

---

## Documentation Cloudflare Officielle

- [Cloudflare Tunnels - Quickstart](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/)
- [cloudflared CLI reference](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/reference/cloudflared-cli/)
- [ARM64/ARM builds](https://github.com/cloudflare/cloudflared/releases/)
