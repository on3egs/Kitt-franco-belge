# Voix Guy, dictée CB, photos et rappels

Copier à côté du serveur actif les modules `kitt_chat_api.py`, `kitt_chat_memory.py`, `kitt_chat_audio_api.py`, `kitt_chat_voice.py`, `kitt_chat_images.py`, `kitt_chat_vision.py` et `kitt_chat_meals.py`. Le serveur doit appliquer les changements de `kyronext-chat-voice.integration.patch`. Les dépendances utilisées sont déjà présentes dans le venv AGX : aiohttp, Pillow, PiperGPU et faster-whisper ; ffmpeg/ffprobe doivent être disponibles sur le système. Aucun moteur GPU n'est chargé en double : les fournisseurs reçoivent les instances déjà utilisées par KYRONEXT.

## API

| Route | Fonction |
|---|---|
| POST `/api/kitt-chat/speech` | JSON texte, personnage, identifiant public facultatif ; WAV Guy KITT ou Guy HD |
| POST `/api/kitt-chat/transcribe` | Multipart `audio` ; retourne un texte, sans publication |
| POST `/api/kitt-chat/images` | Multipart `image`, `room`, `caption` ; publication explicite |
| GET `/api/kitt-chat/images/{id}.webp` | Photo publique normalisée |
| DELETE `/api/kitt-chat/images/{id}` | Suppression par auteur ou administrateur |
| POST `/api/kitt-chat/images/{id}/describe` | Analyse visuelle locale et réponse du personnage choisi |
| DELETE `/api/kitt-chat/session` | Révoquer uniquement l'appareil explicitement oublié |

Les routes de dictée, publication et analyse exigent la session Bearer d'un profil approuvé. Pour obtenir ce profil, le visiteur inscrit sa Pontiac sur le Globe avec une photo de la voiture, puis attend la validation. Les invités gardent la conversation textuelle et peuvent lire les réponses publiques. Une description demandée par un membre est publiée dans tout le salon ; elle commence par le prénom du profil qui a cliqué, et la voix correspond au bouton KITT/KARR choisi. La lecture vocale publique sans session est limitée aux textes publics effectivement présents dans l'historique, identifiés par leur messageId. Les synthèses identiques sont mutualisées entre auditeurs et conservées dans un cache RAM borné à 16 Mo ; les lectures du cache ne consomment pas le quota de nouvelles synthèses. Il n'y a pas de modification globale de la voix du chatbot principal.

La dictée accepte les formats MediaRecorder des navigateurs, y compris les WebM sans durée déclarée. ffmpeg normalise au maximum 21 secondes en WAV mono 16 kHz ; les enregistrements de plus de 20,5 secondes sont rejetés avant Whisper. Les temporaires sont supprimés, aucun jeu de données vocal n'est alimenté et aucun message n'est envoyé automatiquement.

Les photos occupent au maximum 150 Mo / 200 fichiers, avec une rétention de 90 jours. La copie originale et ses métadonnées ne sont pas conservées. La limite d'entrée est 8 Mo et 25 millions de pixels ; un espace disque libre minimal de 256 Mo est conservé. Les descriptions ne sont jamais fabriquées si le moteur visuel est indisponible.

L'analyse ne démarre qu'après le clic explicite sur **Décrire avec KITT** ou **Décrire avec KARR**. Le personnage choisi publie d'abord une courte annonce d'attente, visible dans le salon et lue avec sa propre voix, puis sa description. Les annonces de KARR varient et gardent son ton contrarié et ironique.

## Rappels de courtoisie de KITT et KARR

Seules les insultes explicites proches du nom de KITT ou KARR déclenchent la modération ; une critique ordinaire ne suffit pas. KARR avertit une première fois, puis renvoie au salon au nouvel écart. KITT donne trois rappels gradués, dont une explication claire, puis retire la personne au nouvel écart. Les rappels et renvois sont des messages du personnage dans le salon, donc suivent aussi les préférences vocales des clients.

Un renvoi est retenu cinq minutes en mémoire vive, sans journal d'adresse IP. Au retour, le personnage lance une pique et laisse douze secondes pour présenter des excuses ; il accepte ce pardon une seule fois. Sans excuses, le client est renvoyé. Après le pardon unique, une nouvelle récidive entraîne un renvoi sans seconde exception. Les avertissements, renvois et pardons ne sont pas persistés après un redémarrage du service.

## Vision Gemma 4 sur cet AGX

Le modèle déjà installé est Gemma 4 26B A4B QAT. Son projector compatible a été téléchargé depuis le [dépôt QAT Unsloth](https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/blob/main/mmproj-BF16.gguf), au commit `f67b000030c50cb0cd0e46ab446093005c3842b8` : 1 194 828 256 octets, SHA-256 `7b06953ccdbe8cf363f47841a7afaacd2b1c2ff9a8d6b426fdec7521a6878744`.

Le patch `kyronext-gemma4-vision-start.patch` ajoute `--mmproj` seulement pour ce modèle. `KYRONEX_MMPROJ_CPU=1` permet le repli du projector sur CPU si un diagnostic mémoire le justifie. Le provider refuse les serveurs d'inférence externes : les photos sont transmises en mémoire au service local 8080. Aucun poids de modèle ni clé privée n'est versionné dans ce dépôt.

## Vérifications réalisées

**Régression AGX corrigée le 30 octobre 2026 :** le profil `kitt-ajx` doit lancer `llama-server` avec `--batch-size 1024 --ubatch-size 1024`. La valeur `ubatch=128` faisait planter llama.cpp pendant le décodage Gemma 4 image (`non-causal attention requires n_ubatch >= n_tokens`) et coupait ensuite les réponses textuelles. Le provider borne maintenant les photos à 768 px avant l'inférence.

- Voix Guy réelle : WAV différents pour KITT avec effets et KARR propre ; répétition du même texte servie à l'identique par le cache.
- Whisper réel : transcription d'un WebM de type navigateur, sans post dans le salon ; session de diagnostic révoquée ensuite.
- Vision réelle : lecture de « KYRONEXT 42 », carré rouge et cercle bleu sur une image synthétique en 3,57 secondes. Une photo quelconque peut prendre plus longtemps ou rester ambiguë.
- Chrome Windows : maintien/relâchement, absence de capture en saisie, permissions retardées, aucune voix pendant la capture, brouillon sans envoi ; aperçu/publication/photo en modale/suppression ; préférences et affichage 1440/390 pixels.
- Tests HTTP isolés : accès, limites mémoire/disque, fichier trop long, suppression des métadonnées, propriété des photos, signalements et persistance des rappels repas.
