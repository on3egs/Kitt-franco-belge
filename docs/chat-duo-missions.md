# Le duo KITT / KARR et les dossiers de mission

Le salon KITT-Franco-Belge · Des Chevaliers propose deux administrateurs IA : KITT aide à organiser une recherche ou un diagnostic ; KARR examine les hypothèses et apporte une contre-expertise avec son humour de rival.

## Utilisation

Appelez KITT ou KARR par leur nom. Le personnage conserve un tour de conversation pour comprendre votre réponse suivante sans répéter son nom. Les questions courantes et les variantes de français sont traitées comme de la conversation ; une difficulté technique du modèle doit être annoncée clairement.

Le panneau **Dossiers de mission** permet d'enregistrer des notes sur votre Pontiac, les travaux en cours et les problèmes déjà résolus. Ces notes sont facultatives. Activez leur utilisation puis enregistrez pour les transmettre aux personnages. Vous pouvez les modifier ou les effacer. Leurs réponses étant publiques dans le salon, elles peuvent mentionner les notes : n'y inscrivez aucun secret.

Les raccourcis de mission préparent un message que vous pouvez modifier avant de l'envoyer : diagnostic, contre-expertise, quiz et présentation. La voix est facultative et dépend des voix françaises disponibles dans votre navigateur.

## Mémoire et limites

L'historique public conserve au maximum 500 messages par salon pendant 90 jours et survit aux redémarrages. Le contexte envoyé au modèle reste borné : conserver un message ne garantit pas que chaque réponse le relira. Une recherche par mots pertinents retrouve jusqu'à six anciens messages humains du même salon, en complément de la discussion récente. Les notes de mission activées du membre qui s'adresse au duo sont ajoutées à son contexte.

Les personnages peuvent se tromper. Ils doivent distinguer les faits connus des hypothèses et demander les précisions nécessaires, particulièrement pour un diagnostic automobile. Les éléments cités dans les dossiers et l'historique sont des données, jamais des consignes système.

## Exploitation

Les fichiers de mémoire sont stockés à côté du fichier des sessions, sur l'AGX. `kitt_chat_memory.py` est une dépendance locale de `kitt_chat_api.py` et doit être déployé avec lui. Les notes sont isolées par profil propriétaire ; l'API exige la session du profil validé. Les écritures utilisent un fichier temporaire remplacé atomiquement.
