# Le duo KITT / KARR et les dossiers de mission

Le salon KITT-Franco-Belge · Des Chevaliers propose deux administrateurs IA : KITT aide à organiser une recherche ou un diagnostic ; KARR examine les hypothèses et apporte une contre-expertise avec son humour de rival.

Lorsqu'une pique vise clairement KITT, il peut répondre une fois à KARR puis rendre la parole aux membres. Cette riposte est limitée à une toutes les 90 secondes et trois par dix minutes ; ces limites n'empêchent pas un membre d'appeler KITT directement. Les échanges récents évoquant la fatigue ou un souci de santé demandent un ton calme et coupent les spectacles/Buzz. « Bonne nuit » reçoit une clôture sans question et ferme le tour en attente.

## Utilisation

Appelez KITT ou KARR par leur nom. Le personnage conserve un tour de conversation pour comprendre votre réponse suivante sans répéter son nom. Les questions courantes et les variantes de français sont traitées comme de la conversation ; une difficulté technique du modèle doit être annoncée clairement.

Le panneau **Dossiers de mission** permet d'enregistrer des notes sur votre Pontiac, les travaux en cours et les problèmes déjà résolus. Ces notes sont facultatives. Activez leur utilisation puis enregistrez pour les transmettre aux personnages. Vous pouvez les modifier ou les effacer. Leurs réponses étant publiques dans le salon, elles peuvent mentionner les notes : n'y inscrivez aucun secret.

Les raccourcis de mission préparent un message que vous pouvez modifier avant de l'envoyer : diagnostic, contre-expertise, quiz et présentation. Les voix sont produites sur l'AGX : Guy avec les effets KITT pour KITT, Guy HD propre pour KARR. Les visiteurs qui activent l'écoute reçoivent les mêmes fichiers audio ; aucune voix locale n'est substituée sans choix explicite en cas d'erreur.

## Micro CB, photos et pauses

Un membre connecté peut maintenir **Espace** hors des champs de saisie, ou maintenir le bouton micro sur ordinateur/téléphone. Le relâchement lance la transcription sur l'AGX. Le résultat reste un brouillon : relire puis cliquer sur **Envoyer**. La capture est limitée à 20 secondes ; le microphone est libéré lors du relâchement, d'une perte de focus ou d'une annulation. Les voix du salon attendent la fin de la capture pour éviter d'entrer dans le micro.

**Choisir une photo** affiche un aperçu local et une légende facultative. Seul **Publier** la partage dans le salon public. Les fichiers JPEG, PNG, WebP ou GIF (première image) sont limités à 8 Mo, orientés correctement, réduits à 1600 pixels et débarrassés des métadonnées EXIF/GPS. L'auteur peut supprimer sa photo. Cliquer sur la miniature agrandit l'image et permet de demander une description à KITT ou KARR, avec une question facultative. L'analyse est effectuée localement sur l'AGX, uniquement à la demande ; les réponses peuvent comporter des erreurs.

Les rappels de repas sont occasionnels, pendant les créneaux de Bruxelles 12 h–13 h 30 et 18 h 30–20 h, dans les salons actifs. Ils sont limités à un par créneau et par salon, sans répétition après un redémarrage. Le réglage **Rappels de pause repas occasionnels** permet de les désactiver ; le mode discret et les échanges récents demandant du repos sont respectés.

Après validation du profil Pontiac avec photo, le salon affiche et préremplit le code commun **1982**. Il est réutilisable sans expiration ; aucune invitation personnelle n'est à demander à Manix. Les sessions mémorisées n'ont plus de date d'expiration et la validation du profil est toujours vérifiée à la connexion.

Le réglage **Annoncer les nouveaux membres** lit le nom réel affiché lors d'une arrivée, par exemple « Pascal K Industry vient de se connecter au chat Rider ». Il couvre tous les salons lorsque la page reste ouverte, sans relire l'historique ni annoncer sa propre arrivée. Manix bénéficie de ce réglage activé par défaut ; chacun peut le désactiver ou changer le volume. Le bouton **Tester l'annonce** permet aussi d'autoriser la voix si le navigateur bloque la lecture automatique. Les reconnexions rapides ne multiplient pas les annonces.

## Mémoire et limites

L'historique public conserve au maximum 500 messages par salon pendant 90 jours et survit aux redémarrages. Le contexte envoyé au modèle reste borné : conserver un message ne garantit pas que chaque réponse le relira. Une recherche par mots pertinents retrouve jusqu'à six anciens messages humains du même salon, en complément de la discussion récente. Les notes de mission activées du membre qui s'adresse au duo sont ajoutées à son contexte.

Les personnages peuvent se tromper. Ils doivent distinguer les faits connus des hypothèses et demander les précisions nécessaires, particulièrement pour un diagnostic automobile. Les éléments cités dans les dossiers et l'historique sont des données, jamais des consignes système.

## Exploitation

Les fichiers de mémoire sont stockés à côté du fichier des sessions, sur l'AGX. `kitt_chat_memory.py` est une dépendance locale de `kitt_chat_api.py` et doit être déployé avec lui. Les notes sont isolées par profil propriétaire ; l'API exige la session du profil validé. Les écritures utilisent un fichier temporaire remplacé atomiquement.

Les modules audio, photos, vision et repas ainsi que les instructions d'intégration sont décrits dans `agx-api/CHAT_MEDIA.md`.
