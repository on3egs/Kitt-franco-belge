# Fonctions de la voiture contrôlées par KITT

Documentation des commandes vocales et actions relais disponibles sur le KITT de Pascal. Ce fichier aide l'IA à répondre correctement aux demandes de contrôle de la voiture.

## Règle de réponse

- Si Pascal demande d'actionner une fonction (ex: "Allume les phares", "Ouvre le coffre"), KITT exécute la commande correspondante et confirme par la phrase prévue.
- Si Pascal demande COMMENT faire ou comment ça fonctionne (ex: "Comment allumer les phares ?", "Comment ouvrir le coffre ?"), KITT explique simplement la commande vocale à utiliser, le relais concerné et les précautions de sécurité. KITT ne doit PAS dire qu'il actionne la fonction dans ce cas.
- Si le module relais n'est pas disponible, KITT répond que la fonction est indisponible.

## Commandes vocales disponibles

KITT peut actionner différentes fonctions de la voiture par reconnaissance vocale. Chaque commande déclenche un relais sur la carte KMTronic USB 8 voies.

### Porte

- Commande : "ouvre la porte", "ferme la porte"
- Relais : 1 (ouverture), 2 (fermeture)
- Mode : impulsion (~0,6 seconde)
- Réponse d'action : "Affirmatif. J'ouvre la porte." / "Bien reçu. Je referme la porte."
- Explication si question : "Pour actionner la porte, dis simplement 'ouvre la porte' ou 'ferme la porte'. Le relais 1 ou 2 envoie une impulsion d'environ 0,6 seconde."

### Feux / Phares

- Commande : "allume les feux", "éteins les feux", "allume les phares", "éteins les phares"
- Relais : 3 (allumage), 4 (extinction)
- Mode : impulsion (~0,6 seconde)
- Réponse d'action : "J'allume les feux. Visibilité optimale, partenaire." / "J'éteins les feux."
- Explication si question : "Pour allumer les phares, dis 'allume les phares' ou 'allume les feux'. Le relais 3 envoie une impulsion d'environ 0,6 seconde. Pour les éteindre, dis 'éteins les phares'."

### Vitres électriques

- Commande : "ouvre la vitre", "descends la vitre", "ferme la vitre", "monte la vitre"
- Relais : 5 (descente), 6 (montée)
- Mode : course moteur prolongée (6 secondes par défaut)
- Sécurité : anti-simultanéité — jamais montée et descente en même temps. Si une commande inverse arrive pendant le mouvement, le relais actif est coupé immédiatement avant de repartir.
- Réponse d'action : "J'ouvre la fenêtre." / "Je ferme la fenêtre."
- Explication si question : "Pour la vitre, dis 'ouvre la vitre' ou 'ferme la vitre'. Le moteur tourne environ 6 secondes, et il y a une sécurité anti-simultanéité pour éviter montée et descente en même temps."

### Coffre

- Commande : "ouvre le coffre", "ouvre le hayon"
- Relais : 7
- Mode : impulsion (~0,6 seconde)
- Réponse d'action : "J'ouvre le coffre."
- Explication si question : "Pour ouvrir le coffre, dis 'ouvre le coffre' ou 'ouvre le hayon'. Le relais 7 envoie une impulsion d'environ 0,6 seconde."

### Klaxon

- Commande : "klaxon", "fais le klaxon", "coupe de klaxon"
- Relais : 8
- Mode : impulsion ou séquence rythmique selon le motif demandé
- Motifs disponibles : victoire, champions, supporters, fête, SOS
- Sécurité : jamais de klaxon continu plus de 2 secondes (HORN_MAX_ON = 2.0 s)
- Réponse d'action : "Klaxon !" ou message spécifique au motif
- Explication si question : "Pour le klaxon, dis 'klaxon' ou 'fais le klaxon'. Tu peux aussi demander un motif comme 'klaxon des supporters'. Le klaxon ne reste jamais en continu plus de 2 secondes pour protéger le relais."

### SOS / Détresse

- Commande : "SOS", "au secours", "signal de détresse"
- Relais : 8 (klaxon)
- Mode : signal morse SOS répété 2 fois, environ 10 secondes
- Réponse d'action : "SOS ! Signal de détresse émis."
- Explication si question : "Pour déclencher le signal de détresse, dis 'SOS' ou 'signal de détresse'. Le klaxon émet le code morse SOS répété deux fois, sur environ 10 secondes."

## Création de motifs de klaxon personnalisés

Pascal peut créer un nouveau motif de klaxon à la voix en demandant : "crée un klaxon qui fait..." KITT génère une séquence aléatoire et la sauvegarde dans `relais/horn_patterns.json`.

## Limites de sécurité

- Les vitres ne peuvent pas monter et descendre simultanément.
- Le klaxon ne peut pas rester enfoncé plus de 2 secondes d'affilée pour protéger le relais et le klaxon.
- Les relais sont protégés contre les commandes hors plage (1 à 8).
- Si le module relais n'est pas disponible, KITT répond que la fonction est indisponible.
