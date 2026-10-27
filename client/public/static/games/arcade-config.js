/*
 * KYRONEXT ARCADE RELAY — configuration commune à toutes les Jetson.
 *
 * Laisser une chaîne vide signifie « utiliser le serveur qui a servi cette
 * page ». Pour un Nano ou un futur K4000/K95, définir cette valeur vers le
 * relais central de l'installation (par exemple l'AGX Manix :
 * https://192.168.129.24:3000) avant de déployer la page.
 *
 * Ne pas mettre une adresse de machine distante en dur dans games-advanced.js:
 * ce fichier est précisément le point de configuration prévu pour la flotte.
 */
window.KYRONEX_ARCADE_RELAY_ORIGIN = "";
window.KYRONEX_ARCADE_PROTOCOL = 1;
window.KYRONEX_ARCADE_IDENTITY = "AGX / MANIX";
