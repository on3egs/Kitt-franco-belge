# KITT — Mise à jour et procédure de recréation

Date : 26 août 2026

## Fonctionnalités communes

- Modes de connaissance RAG activables à la demande : Général, Pontiac, KITT, Chiens, Knaus/Ducato et Audi 80.
- Une seule spécialité est active à la fois afin de limiter la recherche documentaire et la consommation mémoire.
- Commandes d'aide reconnues par l'interface : `help`, `aide`, `aide moi`.
- Tableaux spécialisés affichables depuis le panneau `AIDE / MODES` : moteurs Pontiac, repères KITT, races et besoins canins, contrôles Knaus/Ducato, Audi 80.
- Les modes écrit et vocal transmettent la spécialité active au serveur.

## Fiabilité et sécurité

- Les fiches locales sont chargées au démarrage par le RAG.
- Les faits essentiels sont verrouillés pour éviter les hallucinations : Firebird à propulsion, Berger australien développé aux États-Unis, Audi 80 1.8 S généralement en traction avant.
- Une fuite de gaz ne doit jamais être recherchée avec une flamme : couper si possible, aérer sans provoquer d'étincelle, évacuer et appeler un professionnel.
- Une difficulté respiratoire chez un chien est une urgence vétérinaire.
- Les valeurs mécaniques exactes doivent être confirmées par VIN, code moteur et année.

## Pascal

- Service `kitt-ai.service` actif.
- HTTPS local sur le port 3000 et HTTP tunnel sur 3001.
- Hotspot persistant `KITT-Pascal`, IP Wi-Fi `192.168.128.27/24`.
- RAG : `PASCAL_KNOWLEDGE_SPECIALITES.md` et `PASCAL_BLAGUES_BELGES_FRANCAIS.md`.
- LLM Gemma/llama.cpp reste le backend validé de Pascal ; STT et TTS ont été testés séparément et en chaîne complète.

## KARR / NX

- Architecture cible CUDA 12.6 / SM87.
- Module pybind `_edgellm_runtime` compilé et importé avec succès.
- Un build sans FMHA-v2 compile mais ne peut pas exécuter le moteur Gemma ; il reste un fallback de développement.
- Le build FMHA-v2 avec l'artefact `libcutedsl_aarch64.a` a été compilé avec CUDA 12.6 / SM87.
- Le serveur TensorRT utilise désormais le nouveau binaire et plugin issus de ce build ; une génération Gemma réelle a réussi.
- Le fallback `build_full` reste disponible pour retour arrière contrôlé.

## Recréation d'un futur « bébé NX »

1. Restaurer le dépôt TensorRT-Edge-LLM et installer CUDA, TensorRT, pybind11 et les dépendances Python.
2. Sélectionner l'artefact CuTe DSL correspondant exactement à l'architecture SM et à la version CUDA.
3. Compiler le module avec `CMAKE_CUDA_ARCHITECTURES=87` et tester l'import Python.
4. Tester séparément le binaire TensorRT, le chargement du moteur, le pré-remplissage FMHA et une génération.
5. Seulement après ces tests, modifier le service LLM et conserver le backend précédent comme retour arrière.
6. Copier les fiches RAG et vérifier les services, ports, GPU, RAM, voix et réseau.

## Sauvegarde

Archive locale : `KITT_RECOVERY_BACKUPS/KITT_RECOVERY_REBUILD_2026-08-26.tar.gz`

Cette archive contient le code, les fiches RAG, les scripts de test, le projet TensorRT et les unités systemd utiles à la recréation.
