# Midnight Disk — livre d'or et messages privés

Service aiohttp + SQLite installé sur KARR. Aucun e-mail ou message externe n'est envoyé automatiquement.
Les visiteurs choisissent un commentaire public ou un message privé pour Manix.
L'adresse e-mail facultative n'est conservée que pour un message privé.

## Installation

- Source exécutée : `/home/karr/.local/share/kyronext-midnight/service/`
- Données persistantes : `/home/karr/.local/share/kyronext-midnight/data/guestbook.sqlite3`
- Clé d'administration : fichier `admin-token` dans le dossier des données, mode 0600.
- Service : `kyronext-midnight-guestbook.service`, démarrage automatique, port local 4398.
- Cloudflare achemine uniquement `/api/midnight/*` vers ce service ; les autres routes gardent leur destination.
- Accès personnel généré sur KARR : `/home/karr/.local/share/kyronext-midnight/admin-access.url`.
- Copie pour Manix : `Documents/KYRONEXT-Messages/Messages de Manix.url` sur son PC.

Le raccourci personnel fournit la clé par un fragment d'URL, puis l'interface la retire de la barre d'adresse.
La clé est transmise dans l'en-tête Authorization pour lire les messages privés ou masquer/rétablir une contribution.
L'espace de gestion affiche les 200 messages les plus récents, publics et privés.
Une restauration conserve le caractère public ou privé d'origine.

## Comportement

- Commentaires publics immédiatement affichés ; messages privés exclus de toutes les réponses publiques.
- Corps limités à 12 Kio, textes de 3 à 2000 caractères, pseudo de 2 à 60 caractères.
- Trois transmissions par adresse réseau sur quinze minutes ; adresse conservée sous forme de HMAC.
- Identifiant de requête unique pour éviter les doublons après une réponse réseau perdue.
- Filtre d'origine, champ invisible anti-robot, deux liens maximum par message.
- Texte des visiteurs inséré dans le DOM avec textContent.
- Les erreurs d'envoi gardent le brouillon dans le formulaire.
- Si KARR ou son tunnel est indisponible, le formulaire le signale et n'affirme pas que le message est enregistré.

Sauvegarder le dossier des données pendant un arrêt du service, ou utiliser l'API de sauvegarde SQLite,
afin de tenir compte du journal WAL. Le code et la configuration ne contiennent aucune clé d'administration.

## Vérification

`python3 -m unittest -v test_guestbook.py`

Les tests isolés couvrent la persistance après réouverture, la séparation privé/public,
la modération réversible, l'authentification, la validation, les tentatives répétées et la limitation de débit.
Des essais navigateur ont vérifié le formulaire public, le message privé, le rechargement,
le brouillon conservé après échec réseau, l'accès Manix et l'affichage mobile.
