# Manix Voice Studio pour Windows 11

Petit installateur Windows par utilisateur. L'application lance le site dans une fenêtre Edge dédiée, sans intégrer de navigateur tiers ni le moteur GPU. Le moteur de conversion reste sur l'AGX et nécessite une connexion Internet.

## Construction

Depuis la racine du dépôt, dans Windows PowerShell avec .NET Framework 4.8 (inclus dans Windows 11) :

```powershell
powershell -ExecutionPolicy Bypass -File voice-studio/windows/build.ps1
```

Sortie : `client/public/downloads/ManixVoiceStudioSetup.exe`.

## Vie privée et limites

L'application est une enveloppe Windows pour https://kitt-franco-belge.be/studio-voix. Les enregistrements envoyés et les fichiers générés suivent les règles affichées par le studio. Les modèles AGX ne sont pas inclus dans l'installateur. L'installateur n'installe aucun pilote et ne demande pas de droits administrateur.

L'installateur n'est pas signé avec un certificat de signature commerciale; Windows peut afficher l'avertissement éditeur habituel pour un fichier téléchargé.
