# Musique communautaire

Le formulaire `/soumettre-musique` envoie par défaut un fichier depuis le PC. Les fichiers acceptés sont MP3, WAV, OGG, FLAC et M4A, jusqu’à 64 Mio. Les déclarations de droits et le thème Knight Rider restent obligatoires. Une proposition entre dans la liste en attente ; l’administrateur peut la préécouter puis l’approuver.

`community_music.py` s’appuie sur aiohttp et sur le binaire FFmpeg avec l’encodeur `libmp3lame`. Ces composants sont présents sur l’AGX. Il conserve les fichiers d’origine dans `data/community_music` et prépare une copie `UUID.web.mp3` à 128 kbit/s pour la lecture publique. L’échec de préparation est signalé à l’administrateur, sans supprimer l’original. Le fichier reste privé avant approbation.

La base `music_submissions.json` conserve les métadonnées, le statut et l’adresse relative du fichier. Sauvegarder ce fichier et `data/community_music` ensemble. La disponibilité publique dépend du serveur KITT et de son tunnel.

`music_audio_proxy.py` sert en priorité les copies des anciens morceaux approuvés placées dans `data/music_playback_cache/<SHA256 de l’URL>.mp3`. Les originaux correspondants sont conservés à côté. Un cache absent utilise le relais HTTP, qui conserve les plages demandées et détecte le vrai type audio. Les réponses hébergées et en cache prennent en charge Range et HEAD.

Vérifications de la livraison : TypeScript et build ; 17 tests d’upload/conversion/authentification ; 19 tests du relais HTTP et 3 tests de cache ; régression navigateur avec introduction silencieuse, pause/reprise, piste suivante et envoi multipart. Les notifications externes sont simulées pendant les tests.
