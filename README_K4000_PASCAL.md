# 🚗 K-4000 — Pascal Ferron Edition

> **La voiture intelligente du futur, maintenant avec l'identité Pascal Ferron**

## 🎯 À propos

K-4000 est une réplique fonctionnelle de la célèbre voiture de Knight Rider 2000, équipée d'une intelligence artificielle locale.

**Propriétaire:** Pascal Ferron  
**Basé sur:** Knight Rider 2000 (KR-95)  
**Technologie:** Jetson Orin Nano 8GB Super + Nemotron 3 Nano 4B

## 🌐 Accès

- **Portail Public:** [https://kitt-franco-belge.be/kyronex/](https://kitt-franco-belge.be/kyronex/)
- **K.I.T.T. Pascal:** [https://kitt-pascal.kitt-franco-belge.be](https://kitt-pascal.kitt-franco-belge.be)
- **Interface K4000:** `http://192.168.129.27:3000/k4000/` (LAN)

## 🛠️ Stack Technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| **Hardware** | Jetson Orin Nano 8GB | JetPack 7.2.1 (L4T r39.2.1) |
| **GPU** | NVIDIA Orin | CUDA 13.2 |
| **LLM** | Nemotron 3 Nano 4B | Q4_K_M (GGUF) |
| **Backend** | llama.cpp | CUDA build |
| **STT** | faster-whisper | base CUDA |
| **TTS** | Piper | CUDA |
| **Frontend** | HTML5/CSS3/JS | Vanilla |
| **Tunnel** | Cloudflare | Named tunnel |

## ✨ Fonctionnalités

### Interface K4000
- ✅ Chat vocal en temps réel avec streaming
- ✅ Reconnaissance vocale (push-to-talk & auto-écoute)
- ✅ Afficheur vocal animé (equalizer)
- ✅ Scanner KITT animé (idle, speaking, listening)
- ✅ Sélection de voix (KITT, Manix, Guy, English)
- ✅ Effets vocaux (KITT Classic, KARR Classic, Studio)
- ✅ Barre de commandes (ODB, NAV, VIG, VOL, etc.)
- ✅ Modes spéciaux (NORMAL, COMMANDE, TECHNIQUE, CUISINE)
- ✅ Panneaux système (ODB, GPS, Caméra)
- ✅ Mood Effects (Angry, Impatient)
- ✅ Design responsive (mobile-friendly)

### Backend
- ✅ Serveur vocal local (aiohttp)
- ✅ API REST pour le chat et la gestion
- ✅ Intégration OBD2 pour diagnostic véhicule
- ✅ Contrôle physique du véhicule
- ✅ Gestion des sessions et mémoire

## 🎨 Design

**Thème:** Noir/Rouge Futuriste  
**Inspiration:** Knight Rider, Cyberpunk  
**Couleurs principales:**
- Rouge primaire: `#ff0000`
- Rouge clair: `#ff2222`
- Rouge foncé: `#880000`
- Fond profond: `#000000`
- Fond panel: `#0a0000`

## 📦 Installation

### Prérequis
- Jetson Orin Nano 8GB (ou compatible)
- JetPack 7.2.1
- CUDA 13.2
- Python 3.10+

### Déploiement
```bash
# Cloner le repo
git clone https://github.com/on3egs/Kitt-franco-belge.git
cd Kitt-franco-belge

# Installer les dépendances
./k4000/app/start_kitt.sh

# Démarrer les services
sudo systemctl start kitt-ai llama-nemotron cloudflared-pascal jetson-clocks-max
```

## 🚀 Utilisation

### Commandes vocales
| Commande | Action |
|----------|--------|
| "KITT, bonjour" | Salutation |
| "Ouvre ODB" | Active le diagnostic OBD2 |
| "Navigation [ville]" | Lance la navigation GPS |
| "Mode technique" | Active le mode technique |
| "Volume 50" | Ajuste le volume à 50% |
| "Vigilance" | Active la caméra de vigilance |

### Raccourcis clavier
| Touche | Action |
|--------|--------|
| `Entrée` | Envoyer le message |
| `Maj + Entrée` | Nouvelle ligne |
| `Microphone` | Push-to-talk |
| `AUTO` | Auto-écoute continue |

## 📊 Performances

| Métrique | Valeur |
|----------|--------|
| LLM Speed | 18,5-19 tok/s |
| Prompt Processing | 440-530 tok/s |
| Réponse complète | ~2,3s |
| STT Latency | ~1,6s |
| TTS Latency | 0,1-0,4s |

## 🔧 Maintenance

### Vérifier les services
```bash
systemctl status kitt-ai llama-nemotron cloudflared-pascal jetson-clocks-max
```

### Redémarrer
```bash
sudo systemctl restart kitt-ai
```

### Logs
```bash
journalctl -u kitt-ai -f
```

## 📝 Changelog

### v2.0.0 — Pascal Ferron Edition (20 août 2026)
- ✅ Refonte complète de l'interface
- ✅ Nouvelle identité: Pascal Ferron
- ✅ Style noir/rouge futuriste
- ✅ Optimisations performances
- ✅ Bouton K.I.T.T. PASCAL activé
- ✅ Tunnel Cloudflare permanent

### v1.x.x — Frank/KR-95 Edition
- Interface initiale bleu/rouge
- Fonctionnalités de base

## 🤝 Contribuer

Les contributions sont les bienvenues !

1. Forker le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commiter vos changements (`git commit -m 'Add amazing feature'`)
4. Pousser vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## ⚠️ Sécurité

**⚠️ ATTENTION:** Un ancien token GitHub a été exposé dans le repo. Il a été révoqué et remplacé. **Ne jamais commiter de tokens ou secrets dans le code.**

Utilisez les secrets GitHub ou les variables d'environnement.

## 📄 Licence

Ce projet est sous licence **Propriétaire** — Tous droits réservés.

## 🙏 Remerciements

- NVIDIA pour le Jetson Orin Nano
- Mistral AI pour Nemotron
- L'équipe Kyronext pour le framework
- Pascal Ferron pour son soutien

---

*Document maintenu par l'équipe KITT Franco-Belge*
*Dernière mise à jour: 20 août 2026*
