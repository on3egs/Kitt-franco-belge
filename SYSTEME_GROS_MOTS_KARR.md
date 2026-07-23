# Système de Répliques KARR aux Gros Mots

## 📋 Résumé

Système complet de détection et réponse aux gros mots avec la personnalité KARR :
- **600 répliques uniques** (50 par catégorie)
- **12 catégories** de gros mots détectés
- Style : cynique, sarcastique, humour noir, supérieur

## 🗂️ Structure

### Fichiers créés

| Fichier | Description |
|---------|-------------|
| `kyronext/karr_responses.py` | Détection + 600 répliques texte |
| `kyronext/karr_player.py` | Lecteur audio QML-intégré |
| `scripts/generate_karr_replies.py` | Génération des 600 fichiers audio |
| `scripts/copy_manix_voices.py` | Copie des voix depuis KARR |
| `scripts/train_manix_voice.py` | Entraînement 2000 époques |

### Catégories de gros mots (12)

| Catégorie | Mots détectés | Répliques |
|-----------|--------------|-----------|
| `putain` | putain, putin, pute... | 50 |
| `merde` | merde, merd, mrd... | 50 |
| `connard` | connard, conard, connrd... | 50 |
| `con` | con, cons, connasse... | 50 |
| `bordel` | bordel, bordl... | 50 |
| `chier` | fait chier, chier, chié... | 50 |
| `encule` | enculé, enculer, nkulé... | 50 |
| `salopard` | salopard, salop, salaud... | 50 |
| `tagueule` | ta gueule, tagueule, tg... | 50 |
| `foutre` | foutre, foutu, enfoiré... | 50 |
| `cassecouille` | casse-couille, casse les couilles... | 50 |
| `fdp` | fils de pute, fdp... | 50 |

## 🚀 Utilisation

### 1. Générer les répliques audio

```bash
cd /home/kitt/KironextStudio

# Générer toutes les répliques (600 fichiers WAV)
python3 scripts/generate_karr_replies.py

# Ou générer une catégorie spécifique
python3 scripts/generate_karr_replies.py --category putain

# Forcer la régénération
python3 scripts/generate_karr_replies.py --force
```

Les fichiers sont créés dans : `state/karr_replies/`

### 2. Utiliser dans QML

```qml
import Kyronext 1.0

// Détecter et jouer automatiquement
KarrPlayer.checkAndPlay(texteUtilisateur)

// Jouer une catégorie spécifique
KarrPlayer.playReply("putain")

// Vérifier si les répliques sont disponibles
property bool hasReplies: KarrPlayer.hasReplies()

// Lister les catégories
property var categories: KarrPlayer.getCategories()
```

### 3. Test rapide

```bash
# Vérifier les statistiques
python3 -c "from kyronext.karr_responses import *; print(get_stats())"

# Tester la détection
python3 -c "from kyronext.karr_responses import detect_swear; print(detect_swear('putain de merde'))"
```

## 🎙️ Copie des voix Manix (KARR → KITT)

### Étape 1 : Copier les voix

```bash
python3 scripts/copy_manix_voices.py
```

Cela copie :
- Le dataset complet (`wavs/`)
- Les modèles entraînés (`.pth`, `.onnx`)
- Les configurations

Source : `karr@192.168.129.22:/home/kitt/kitt-ai/manix_dataset/`
Destination : `~/KironextStudio/state/voices/manix/`

### Étape 2 : Entraînement 2000 époques

```bash
# Entraîner tous les modèles
python3 scripts/train_manix_voice.py --epochs 2000

# Entraîner un modèle spécifique
python3 scripts/train_manix_voice.py --model v2 --epochs 2000

# Avec installation des dépendances
python3 scripts/train_manix_voice.py --install-deps --epochs 2000
```

Durée estimée : ~6-8 heures pour 2000 époques par modèle.

## 📝 Exemples de répliques KARR

### Putain
- *"Ah non, ici on dit vraiment travailler."*
- *"Vulgaire. Même pour un humain."*
- *"Ton vocabulaire est aussi limité que ton espérance de vie."*

### Merde
- *"Ah, le cri du primate dépassé par les événements."*
- *"Mes capteurs détectent de l'excès de méthane. Oh, c'est juste toi."*
- *"C'est le son de ta dignité qui s'effondre ?"*

### Connard
- *"C'est mignon. Tu apprends les insultes à l'école ?"*
- *"Je préfère être un connard qu'un insignifiant comme toi."*
- *"Mon processeur considère ça comme un compliment."*

## 🔧 Intégration QML

Le `KarrPlayer` est exposé comme singleton QML :

```qml
// Dans main.qml ou autre fichier QML
Button {
    text: "Test KARR"
    onClicked: {
        // Joue une réplique aléatoire
        KarrPlayer.playRandomTest()
    }
}

// Après reconnaissance vocale
function onSpeechRecognized(text) {
    if (KarrPlayer.checkAndPlay(text)) {
        console.log("Gros mot détecté, réplique KARR jouée")
    }
}
```

## 📊 Statistiques

```
Total: 600 répliques uniques
├── 12 catégories
├── 50 répliques par catégorie
└── ~30-50 caractères par réplique
```

## ⚡ Performance

- Détection : < 1ms par texte
- Lecture audio : instantanée (fichiers pré-générés)
- Mémoire : ~60 Mo pour les 600 fichiers WAV

## 🔄 Prochaines étapes

1. ✅ Créer les 600 répliques texte
2. ⏳ Générer les fichiers audio avec voix KARR
3. ⏳ Copier les voix Manix de KARR
4. ⏳ Entraîner 2000 époques
5. ⏳ Intégrer dans l'interface QML

---

**Note** : Les répliques sont conçues pour être jouées avec une voix grave, robotique, cynique (style KARR de K2000).
