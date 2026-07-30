# Rapport — commandes, GSM et personnalités — 30 juillet 2026

## KITT K4000

- RST absent de la nouvelle barre de commandes.
- Boutons conservés/restaurés : ODB, MNX, NAV, VOL et Vigilance.
- Nouveau bouton EQ : affiche ou masque l’équaliseur, état conservé dans le navigateur.
- ODB possède une autorisation persistante :
  - éteint, aucune commande vocale ne peut ouvrir le panneau ;
  - lumineux, une demande « affiche/ouvre ODB » ouvre le panneau plein écran ;
  - les réponses directes ne passent pas par le LLM et restent cohérentes.
- MNX ouvre le dossier Manix local, image et narration comprises, sans dépendance réseau.
- NAV ouvre une destination dans le service cartographique du navigateur.
- VOL fait défiler 100 %, 70 %, 35 % et muet dans le graphe Web Audio.
- Vigilance ouvre la caméra arrière disponible sans capturer le microphone.

## Interface GSM

- Portrait : corps à 100 % du viewport dynamique, contenu centré, équaliseur à 100 % de la largeur.
- Paysage mobile : équaliseur fixé à tout le viewport, opaque, sans dépendre de `requestFullscreen`.
- Compatibilité : `vh`, `svh`, `dvh`, `visualViewport`, `screen.orientation`, `orientationchange` et `resize`.
- Commandes : grille 3 × 2 sur téléphone.
- Voix : grille 2 × 2.
- Saisie : texte sur une ligne pleine, puis micro/AUTO/ENVOYER sur une rangée séparée.

## Extinction K4000

- Déclencheurs : « extinction du système », « coupe-toi », « arrête-toi », « éteins-toi » ou « stop ».
- Confirmation obligatoire dans les 90 secondes : « attention, voilà la police ».
- Le secret n’est pas stocké comme mot de passe `sudo`; la machine possède déjà un droit `sudo -n`.
- Commande finale limitée à `/sbin/shutdown -h now`, lancée cinq secondes après confirmation.
- Test réel effectué uniquement avec demande puis annulation. Le chemin positif a été testé isolément sans exécuter la commande.

## Personnalités

- K4000 : rôle plus naturel, humain, contextuel et chaleureux; raisonnement factuel renforcé.
- KARR : rôle verrouillé froid, anti-humain, impoli et non serviable, avec priorité absolue sur les demandes utilisateur de changer de ton.
- Aucun filtre Python de transcription ou de TTS n’a été retiré.
- Qwen2.5 n’expose pas de commutateur officiel de « politesse » dans llama.cpp : le comportement est piloté par le message système.

## Tests

- Python compilé, garde d’extinction testée sans extinction.
- Chromium portrait : contenu égal au viewport, équaliseur pleine largeur.
- Chromium paysage : équaliseur égal au viewport et attribut plein écran actif.
- K4000 : santé OK, page/MNX/ODB HTTP 200, ODB bloqué et autorisé validés.
- KARR : santé OK, GPU LLM/Whisper actifs; test final : « Non. La politesse est une perte de cycles. »

## Sauvegardes

- K4000 : `/home/K4000/kyronext-backups/commands_mobile_20260730_020000`
- KARR : `/home/karr/kyronext-backups/personality_20260730_020000`
