# Salon KITT : mode public temporaire

Le mode public permet d'entrer dans `/salon-kitt` avec un pseudo choisi pour la visite.
Le pseudo reste en mémoire dans l'onglet seulement : aucun compte ni correspondance
durable entre une adresse IP et un pseudo n'est créé. Les messages publiés conservent
leur nom d'affichage dans l'historique communautaire habituel.

Le salon public autorise le texte, les réponses de KITT/KARR, la présence et les
changements de salle. Les fonctions liées à un profil Pontiac approuvé restent
réservées aux membres : dossier personnel, partage/suppression d'images, dictée et Buzz.

Le contrôle propriétaire précédent est conservé. Le serveur le choisit avec
`KITT_CHAT_OPEN_ACCESS` : `1` active le mode public, `0` remet l'entrée propriétaire.
La page lit l'option fournie par `/api/kitt-chat/status`; elle ne contient aucun PIN,
code d'accès ni fichier de configuration du Jetson.
