# Rapport — KARR RST, MNX et récit Guy — 30 juillet 2026

## KARR de Dadoo

- Le bouton `RST` a été retiré de la barre principale.
- Le bouton `MNX` est conservé.
- Cause de la panne MNX : `/manix` cherchait `static/manix.html`, qui était absent.
- La page, son image et son récit audio sont maintenant entièrement locaux.

## Nouveau récit audio

- Voix : modèle Guy affiché sous « Manix | Kyronext Studio ».
- Les deux Jetson utilisent le même modèle ONNX :
  `bfe8633aec9b33434aa5177280b42905bf262957bf34a6d5d6fe862687bc080c`.
- Master commun : WAV PCM, mono, 22 050 Hz, 16 bits.
- Durée : 99,43 secondes.
- Niveau maximal normalisé à −1 dB afin d’éviter l’écrêtage.
- Empreinte du master :
  `97f8e28cb63f9099cd83cf6db2aad045d1f1b0924349aaeae2a2a0cbc8fc6abb`.
- Le récit conserve le sens de l’ancien fichier, mais utilise une ponctuation et
  des formulations phonétiques adaptées aux noms techniques.

## Déploiement

- KARR : `/static/manix_story.wav`
- K4000 : `/static/mnx/manix_story.wav`
- Les anciennes copies MP3 ont été retirées après validation et restent dans
  les sauvegardes.

## Vérification du LLM

- `llama-server` ne charge ni grammaire de modération, ni LoRA de sécurité, ni
  filtre externe.
- Le modèle embarque le chat template Qwen2.5 standard.
- La phrase « helpful assistant » du template n’est utilisée qu’en l’absence
  de message système. Kyronext fournit toujours son prompt KARR verrouillé.
- Il n’existe donc aucun interrupteur de politesse à désactiver dans
  `llama.cpp`; le ton est contrôlé par le prompt système KARR.
- Les protections système et la confirmation d’extinction restent actives.

## Tests

- KARR `/` : HTTP 200, bouton RST absent, bouton MNX présent.
- KARR `/manix` : HTTP 200.
- KARR audio : HTTP 200, `audio/x-wav`, 4 384 812 octets.
- K4000 `/mnx` : HTTP 200.
- K4000 audio : HTTP 200, même taille et même empreinte.
- Services KARR et K4000 actifs.

## Sauvegardes

- KARR : `/home/karr/kyronext-backups/mnx_rst_20260730_022000`
- K4000 : `/home/K4000/kyronext-backups/mnx_audio_20260730_022000`
