# Manix NetShield PC 1.0.0 — édition autonome

Publié en préversion : https://github.com/on3egs/Kitt-franco-belge/releases/tag/netshield-pc-v1.0.0

L’installateur natif Windows 11 x64 comprend le filtre DNS local, le service, le tableau de bord KITT, l’icône animée, la voix optionnelle, le guide et une liste StevenBlack. Aucun Jetson n’est requis. L’ancienne édition AGX est conservée et ses liens sont désormais explicitement nommés « compagnon Windows pour AGX ».

Installateur : `Manix-NetShield-PC-1.0.0-Setup.exe`, 2 890 467 octets.

SHA-256 : `d69a8160114914c08de1fe9c37406e93c89331984057b166d8d60c62e8c4d456`.

Les sources et tests sont joints à la release. 33 vérifications DNS/IPC et 13 vérifications réseau simulées passent sous Windows. L’installateur compile et le rendu WinForms a été inspecté. L’installation administrateur et l’activation sur une vraie carte n’ont pas été effectuées ; les pages et notes de version indiquent cette limite. Les DNS du poste de développement restent inchangés.

Les pages `/netshield/` et `/netshield/pc-guide.html` sont accessibles sur KITT Franco-Belge et Kyronext. Le visuel du tableau de bord est un aperçu avec données fictives clairement légendées. Le guide présente l’activation, les différents états, la restauration, le dépannage, les données traitées et les limites DNS/DoH/VPN.

Vérification web : `node scripts/netshield-pc-browser-check.cjs`, largeurs 1280, 390 et 320 px, liens des deux éditions, image, guide, débordements et erreurs JavaScript. Le chemin Playwright et les bases peuvent être remplacés par `PLAYWRIGHT_PATH` et `NETSHIELD_BASES` (liste séparée par virgules).
