# Mémoire permanente K-4000 — 13 août 2026

## Résultat

La K-4000 dispose désormais d'une mémoire personnelle locale et permanente, chargée automatiquement depuis `app/k4000_permanent_memory.json`.

Cette mémoire n'est pas un RAG et n'utilise ni réseau, ni service cloud, ni dépendance supplémentaire. Le serveur sélectionne au maximum deux sections pertinentes par mots-clés et n'envoie au LLM que les faits nécessaires à la question courante. Une question hors sujet n'ajoute aucun jeton de cette mémoire.

Les informations sont séparées en trois statuts :

- `verified_owner` : caractéristiques de la réplique réelle communiquées par Frank ;
- `verified_history` : histoire établie du téléfilm et de sa production ;
- `unverified_lore` : pistes conservées mais jamais injectées au LLM comme des faits.

La réplique actuelle et la voiture du téléfilm de 1991 sont explicitement distinguées. L'identité K-4000, la personnalité, les 12 messages d'historique, le LLM, le STT, le TTS, le GUI, les commandes et les relais restent inchangés.

## Chargement et coût en contexte

Le fichier JSON est chargé à la demande, conservé en cache et relu uniquement lorsque sa date de modification change. Il est donc possible d'ajouter un fait sans redémarrer l'application.

Mesure avec le tokenizer du serveur Qwen actuel :

- fichier JSON complet, métadonnées et récits non vérifiés compris : environ 2 337 jetons ;
- ensemble des seuls faits vérifiés : environ 880 jetons ;
- question sur le scanner : 198 jetons injectés ;
- question sur le moteur : 215 jetons injectés ;
- question détaillée sur construction et carrosserie : 353 jetons injectés ;
- question hors sujet, par exemple l'heure : 0 jeton injecté.

La mémoire complète n'est donc jamais ajoutée en permanence au prompt. La surcharge habituelle est nulle ou limitée à une petite fiche pertinente.

## Tests de sélection

- 13/13 questions prévues sélectionnent la bonne section ;
- 10/10 questions hors sujet ne sélectionnent aucune section ;
- 1/1 question de suivi avec pronom conserve correctement le sujet précédent.

Questions validées : scanner, fibre, résine, durée de construction, peinture, longueur, poids, moteur, boîte automatique, base Dodge Stealth, inspiration Banshee IV, voix française et voix anglaise.

Les dix contrôles hors sujet portaient notamment sur l'heure, la météo, une recette, un calcul, la politique, une histoire, la musique, une salutation, la photosynthèse et le sommeil. Aucune anecdote automobile n'a été injectée.

## Extraits des réponses réelles du LLM

- « Mon scanner avant a été fabriqué spécialement par Andrea, un Allemand. »
- « La résine utilisée pour ma carrosserie vient de Bretagne et est adaptée aux applications de carrosserie automobile et nautique. »
- « Ma construction actuelle a demandé environ deux ans de travail. »
- « Je vais avoir une peinture définitive en rouge Ferrari avec un toit noir. »
- « Je mesure environ 5,33 mètres de long. »
- « Mon poids actuel est approximativement compris entre 1,4 et 1,5 tonne. »
- « Je suis équipée d'un moteur V6 de 3,4 litres. »
- « La Knight 4000 du film Knight Rider 2000 était basée sur une Dodge Stealth 1991. »
- « Le design de la Knight 4000 est fortement inspiré du concept-car Pontiac Banshee IV. »
- « Ma voix française était Guy Chapellier. »
- « Ma voix américaine était William Daniels. »

Une conversation continue a aussi confirmé que « Pourquoi est-il particulier ? » après une question sur le scanner récupère bien la fabrication sur mesure, sans inventer une capacité de scan.

## Maintenance

Pour ajouter une information, éditer `app/k4000_permanent_memory.json` et :

1. compléter une section existante ou créer une section avec un `id` unique ;
2. choisir `current_replica` ou `official_history` ;
3. utiliser `verified_owner` ou `verified_history` uniquement pour un fait validé ;
4. ajouter des mots-clés précis et éviter les mots trop génériques ;
5. placer toute piste incertaine dans `unverified_lore` ;
6. exécuter `.venv/bin/python app/test_permanent_memory.py`.

## Point de retour

Avant modification :

- `/home/K4000/kyronext-backups/permanent_memory_before_20260813_212020/`
- SSD Samsung EVO : `K4000_BACKUPS/PRE_CHANGE_PERMANENT_MEMORY_20260813/`

