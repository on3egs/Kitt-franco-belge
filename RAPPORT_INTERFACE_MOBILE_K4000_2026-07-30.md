# Rapport — interface mobile KITT K4000

Date : 2026-07-30

La version mobile du KITT K4000 est désormais centrée sur la conversation : le champ prompt reste dans la zone principale et conserve le clavier natif du smartphone lors de la sélection. Les boutons audio Manuel (micro) et AUTO restent toujours visibles et utilisables.

Les commandes secondaires (ODB, MNX, NAV, VOL, VIG, EQ), ainsi que la sélection de voix et l’effet vocal, sont masqués par défaut sur écran étroit et accessibles via le bouton OPTIONS. Le menu se ferme en cliquant/touchant hors de celui-ci. Le comportement bureau n’est pas modifié.

Tests réalisés :
- page HTTPS K4000 HTTP 200 et contenu déployé contrôlé ;
- présence vérifiée du prompt, de `mic`, `automic`, du menu OPTIONS et des commandes existantes ;
- service `kyronext.service` actif ;
- sauvegarde de retour arrière : `/home/K4000/kyronext-backups/mobile_prompt_menu_20260730_024455/app/static/index.before.html`.
