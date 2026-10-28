# Microphone KYRONEXT sur le réseau local

La page du chatbot est `https://192.168.129.24:3000/`. L'accès au microphone est celui du navigateur du visiteur et dépend d'un contexte HTTPS reconnu comme sécurisé.

## Correction du 28 octobre 2026

Le certificat précédent ne contenait pas l'adresse actuelle `.24` dans son extension SAN. Une autorité locale dédiée **KYRONEXT By Manix Local CA** a été créée sur l'AGX ; le certificat serveur inclut maintenant l'adresse actuelle et conserve les anciens noms locaux. Le certificat public de cette autorité a été vérifié par SSH puis installé dans les autorités racines du compte Windows du propriétaire. Les clés privées restent sur l'AGX.

Le démarrage AUTO pouvait aussi attendre indéfiniment la reprise d'un AudioContext suspendu avant d'ouvrir le micro. Un nouveau clic doit reprendre le contexte existant avant de vérifier si un démarrage est déjà en cours ; le démarrage dispose désormais d'une limite de temps et d'un nettoyage. Les variantes WAKE et manuelle bénéficient aussi de la reprise explicite. Le patch frontend associé est dans `release/kyronext-mic-recovery.patch`.

Un second défaut de livraison masquait les changements : aiohttp servait des compagnons `.gz` périmés lorsque le navigateur acceptait la compression, même si le fichier source était à jour. Cinq compagnons ont été synchronisés avec leurs sources, avec sauvegarde sous `/home/kitt/kitt-ai/backups/micro-gzip-20261028`. Après toute modification des fichiers statiques, exécuter `agx-api/tools/sync_static_gzip.py` sur l'AGX avec les chemins du dossier statique et d'un nouveau dossier de sauvegarde. Vérifier ensuite la réponse HTTP avec compression activée.

La même synchronisation est installée avant chaque démarrage du service via `/etc/systemd/system/kitt-kyronex.service.d/20-static-sync.conf` (source : `agx-api/kitt-kyronex-static-sync.conf`). Elle ne touche que les compagnons compressés existants de fichiers texte et garde une sauvegarde avant modification. Une erreur de synchronisation est journalisée sans empêcher le serveur de démarrer.

Après actualisation, activer **AUTO** et autoriser le microphone si le navigateur le demande. Une autorisation refusée dans le navigateur doit être rétablie pour cette adresse. La confiance dans l'autorité locale est propre à chaque appareil ; elle n'est pas transférée par le simple fait d'ouvrir la page sur un autre ordinateur.

## Fichiers et vérification

- Certificat et clé serveur : `/home/kitt/kitt-ai/certs/cert.pem` et `key.pem`.
- Autorité publique locale : `/home/kitt/kitt-ai/certs/kyronext-local-ca.pem` ; sa clé privée ne doit pas être distribuée.
- Sauvegardes avant changement : `cert.pem.before-local-tls-20261028-024500` et `key.pem.before-local-tls-20261028-024500`.
- Empreinte SHA-256 de l'autorité publique : `CBD1C17177E124A8FAA62FAD83258A4EA0C75F046234F3AAB2DD413D93E97244`.

Le service est `kitt-kyronex.service` au niveau système. Les contrôles comprennent la validation de la chaîne et de l'IP par OpenSSL, l'ouverture de la page dans Chrome sans désactiver la validation des certificats, puis l'envoi d'une capture de test vers `/api/stt-chat`.
