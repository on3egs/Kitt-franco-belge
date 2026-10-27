# KYRONEXT OS - Windows 11

Installateur autonome pour Windows 11 64 bits. Il contient le cockpit statique et ses medias locaux, puis installe les fichiers dans le profil Windows de la personne qui lance le programme. Aucune elevation administrateur, connexion au Jetson/AGX, cle API, compte ou acces Internet n'est necessaire pour lancer le cockpit et jouer.

## Dependances reelles sur le PC cible

- Windows 11 64 bits.
- Microsoft Edge, installe par defaut avec Windows 11. Il affiche le cockpit dans une fenetre dediee avec `--app`.
- Windows PowerShell 5.1 et Windows Forms, composants Windows utilises par l'ecran d'installation.

Le compilateur C# .NET Framework 4.x (`csc.exe`) est necessaire uniquement sur le PC qui fabrique le paquet. Il n'est pas requis pour installer KYRONEXT OS.

Le package embarque le HTML, les jeux, le cavalier, les effets sonores, les messages audio Guy et les scripts d'installation. Il ne copie pas la sauvegarde `index.html.backup` et retire les ressources du site qui emploient des chemins absolus (`/site-assets/cockpit.css` et `/site-assets/cockpit.js`), car elles ne sont pas necessaires au programme local.

## Creer l'installateur

Depuis la racine du depot, sur Windows 11 :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\desktop\kyronext-os\windows\package-windows.ps1
```

Le resultat est place dans `client/public/kyronext-os/downloads/KYRONEXT-OS-Windows11-Setup.exe`. Le script refuse d'ecraser un installateur existant sans `-Overwrite`, compile un lanceur x64 autonome et embarque le cockpit, ses medias et l'assistant d'installation. Il ecrit `windows/download-info.json` avec la taille et le SHA-256 du fichier produit. L'installateur est non signe numeriquement; SmartScreen peut donc afficher un avertissement.

Le parametre `--self-test <rapport.txt>` demarre le bootstrap et verifie l'extraction et le retrait dans un dossier temporaire isole; ce mode ne cree aucun raccourci ni profil Edge. Il ne lance pas l'interface du cockpit.

## Installation et retrait

L'application est installee dans `%LOCALAPPDATA%\Programs\KYRONEXT OS`. Le lanceur cree un profil Edge separe dans `%LOCALAPPDATA%\KYRONEXT OS\BrowserProfile` pour garder les scores et reglages du cockpit distincts du profil Edge habituel. Le raccourci Demarrer et le raccourci Bureau facultatif ouvrent `app\index.html` localement.

Le raccourci « Desinstaller KYRONEXT OS » retire le programme. Il demande separement si les scores/reglages locaux doivent etre supprimes; ils sont conserves par defaut.

Credits visibles dans l'installation : **By Manix** · **KITT-FRANCO-BELGE**.
