# Notes Kyronext — bon / mauvais

Date : 29 juillet 2026  
Machines : KARR Dadoo (`192.168.129.25`) et K4000 Frank (`192.168.129.26`)

## KARR Dadoo

### Mauvais comportement observé

- Kyronext recevait la demande et réfléchissait, mais la réponse n'arrivait pas jusqu'à l'utilisateur.
- Le contexte du serveur LLM était trop petit (`512`) pour un prompt d'environ `1150` jetons.
- Deux variables internes du flux vocal n'étaient pas correctement déclarées avec `nonlocal`.
- La file TTS pouvait être fermée avant d'avoir terminé.
- La voix répondait mot par mot, ce qui produisait une cascade hachée et peu naturelle.

### Bon comportement obtenu

- Contexte LLM porté à `2048`, avec une seule génération parallèle.
- Flux SSE terminé proprement, y compris en cas d'erreur.
- File TTS vidée avant sa fermeture.
- Découpage vocal naturel par propositions : virgule et ponctuation forte.
- Une seule synthèse vocale à la fois, dans l'ordre.
- Service utilisateur LLM persistant pour réduire la latence.

## K4000 Frank

### Mauvais comportement observé

- Réponses moins rapides et moins fluides que KARR.
- Piper était relancé pour chaque morceau de phrase.
- Deux voix pouvaient parler simultanément.
- Le navigateur lançait le morceau suivant sans attendre la fin du précédent.
- K4000 ne connaissait pas Emmanuel Gelinne/Gélinne, le pseudonyme Manix ni le groupe KITT Franco-Belge.
- Il répétait trop souvent des formules comme « veux-tu de l'aide ? » ou « si tu as besoin… ».

### Bon comportement obtenu

- Contexte LLM réglé à `2048`, une seule génération parallèle, `ubatch 512`.
- Historique limité aux huit derniers messages pour garder une réponse rapide.
- Piper chargé une seule fois en mémoire puis réutilisé.
- Synthèse vocale effectuée hors de la boucle asynchrone avec verrou.
- Morceaux vocaux produits par propositions naturelles et livrés dans l'ordre.
- Lecture audio du navigateur strictement séquentielle avec une file globale.
- Aucun chevauchement entre deux réponses.
- K4000 sait que Manix est Emmanuel Gelinne/Gélinne, une personne humaine, créateur et développeur de Kyronext.
- K4000 connaît Frank/KR95 comme constructeur et pilote de la voiture.
- K4000 connaît le groupe Facebook KITT Franco-Belge et sa communauté de passionnés de Knight Rider et de répliques.
- Les offres d'aide ne sont formulées que lorsqu'elles sont utiles et ne sont pas répétées dans des réponses consécutives.

## Mesures et validations

- Chargement initial de Piper : environ `2,6 s`, une seule fois.
- Synthèse des propositions testées : environ `207 à 272 ms` chacune.
- Réponse K4000 complète testée : environ `1,96 s`.
- Génération LLM : environ `1,70 s`.
- Audio restant après génération : environ `0,24 s`.
- Trois réponses consécutives testées sans offre d'aide répétitive.
- Fichiers audio testés accessibles en HTTP avec le statut `200`.
- Services vérifiés actifs après les déploiements.

## Règles à conserver

- Ne jamais revenir à une lecture mot par mot.
- Attendre la fin réelle d'un audio avant de lire le suivant.
- Garder une seule file audio globale dans l'interface.
- Garder Piper chargé en mémoire.
- Garder `--parallel 1` sur ces Jetson.
- Ne pas augmenter inutilement l'historique envoyé au petit modèle.
- Faire une sauvegarde avant chaque déploiement distant.
- Tester une réponse complète, plusieurs morceaux audio et plusieurs tours de conversation après toute modification.

## Commits de référence

- `4d6c85924` — réparation du flux Kyronext et découpage TTS naturel.
- `95a889a3f` — optimisation K4000 et lecture audio séquentielle.
- `26b525994` — connaissances sur Manix et KITT Franco-Belge, réduction des offres d'aide répétitives.

