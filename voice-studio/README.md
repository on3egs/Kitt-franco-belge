# Manix Voice Studio · service AGX

Service indépendant qui transforme réellement le timbre d’une source audio avec une référence vocale, via l’installation Seed-VC existante sur le SSD USB. En mode texte, Piper français crée la lecture source, puis Seed-VC lui applique le timbre de la référence. Ce service ne modifie ni le chatbot ni les réglages réseau.

## Contrat HTTP

Base locale : `http://127.0.0.1:8796/api/voice-studio`.

| Méthode et chemin | Réponse |
| --- | --- |
| `GET /health` | `{ok,ready,engine,beta,queue:{pending,processing,capacity},limits}` |
| `POST /jobs` | Multipart ; réponse HTTP 202 avec l’état de la création |
| `GET /jobs/<id>` | État et progression de la création |
| `GET /jobs/<id>/audio?format=wav` | WAV privé, lorsque la création est terminée |
| `GET /jobs/<id>/audio?format=mp3` | MP3 privé, lorsque la création est terminée |
| `DELETE /jobs/<id>` | `{deleted:true}` ; annule aussi une création en cours |

Champs multipart : `reference` (fichier), `mode` (`audio` ou `text`), `consent` (`true`), puis `source` (fichier) en mode audio ou `text` (1 à 400 caractères) en mode texte. Les formulaires sans consentement sont refusés. La personne doit posséder la voix ou avoir son autorisation explicite. Le service n’authentifie pas l’identité de la personne enregistrée.

Exemple d’état :

```json
{
  "id": "jeton-aleatoire-secret-de-43-caracteres",
  "mode": "text",
  "status": "processing",
  "progress": 30,
  "stage": "Conversion du timbre sur le GPU AGX",
  "error": null,
  "duration_seconds": null,
  "created_at": "2026-10-27T18:00:00Z",
  "expires_at": "2026-10-28T18:00:00Z",
  "status_url": "/api/voice-studio/jobs/…",
  "audio_url": null
}
```

États : `queued`, `processing`, `completed`, `failed`. Les étapes 5/15/30/90/100 sont des jalons et non une mesure fine du calcul GPU. `queue_position` est présent en attente, `audio_url` devient disponible une fois terminé. Les erreurs HTTP sont des objets `{error:"message lisible"}`.

## Limites de la bêta

- Référence de voix seule : 5 à 30 secondes, 20 Mo maximum. Le moteur peut ne retenir qu’une partie de cette référence selon son contexte interne.
- Source audio : 0,5 à 30 secondes, 20 Mo maximum. WAV, MP3, M4A/MP4 AAC, FLAC, OGG et WebM dépendent des codecs du FFmpeg installé. Une source déjà chantée conserve sa mélodie ; un texte français est une lecture parlée.
- Le service ne sépare pas la musique d’une chanson. Fournir une piste de voix isolée améliore le résultat ; un mix musique+voix peut être dégradé.
- Quatre créations actives ou en attente au maximum et une seule conversion GPU. Trois créations par heure par adresse transmise par le proxy. Pas de liste publique des créations.
- Suppression automatique après 24 h, vérifiée chaque minute. Références, sources et textes sont retirés après la réussite ou l’échec ; seuls résultats et état restent jusqu’à expiration. La suppression demandée par l’utilisateur efface aussi le résultat.
- Les jetons secrets donnent accès aux créations : les garder privés. Aucune galerie, aucun référencement, aucun enregistrement de voix public.
- Modèles chargés dans un sous-processus par création, puis mémoire libérée. Le démarrage peut donc prendre du temps. Un calcul est interrompu après 15 minutes.
- Au moins 2 Go libres requis sur le SSD. 100 créations conservées au maximum. En cas de redémarrage, les créations interrompues passent en erreur et leurs entrées sont retirées.

## Déploiement utilisateur

Copier `api.py` dans `/home/kitt/manix-voice-studio/`. Copier `.env.example` dans `/home/kitt/.config/manix-voice-studio.env`, puis l’unité dans `/home/kitt/.config/systemd/user/manix-voice-studio.service`.

```sh
python3 /home/kitt/manix-voice-studio/api.py --check
systemctl --user daemon-reload
systemctl --user enable --now manix-voice-studio.service
curl http://127.0.0.1:8796/api/voice-studio/health
```

Le service écoute exclusivement en loopback. Un reverse proxy HTTPS existant doit publier uniquement le préfixe `/api/voice-studio` et laisser les réponses `Cache-Control: no-store` intactes. Un ingress Cloudflare ciblant directement ce préfixe convient : `CF-Connecting-IP`, fourni et écrasé par Cloudflare, sert au rate-limit. Un autre proxy doit retirer un éventuel `CF-Connecting-IP` envoyé par le visiteur et **écraser** `X-Voice-Studio-Client-IP` avec son adresse réelle. Autoriser POST multipart jusqu’à 40 Mo, GET, DELETE et OPTIONS. Ne pas journaliser les URL contenant les jetons de création. Aucun CORS générique `*` n’est utilisé.

Le moteur Python et les modèles ne sont pas redistribués ici. La licence de Seed-VC et celles de chaque modèle Piper/Seed-VC doivent être conservées et vérifiées avant une redistribution d’installateur. Ce composant ne prétend pas transférer les droits sur les modèles ou les enregistrements.

## Vérification

`python3 -m unittest discover -s voice-studio/tests -v` couvre validation de formulaire, consentement, limites, jetons, annulation, rétention et persistance sans charger de modèle. Le test GPU réel emploie uniquement une référence privée de Manix autorisée dans la session, sans la publier.
