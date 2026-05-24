"""Lecteur de répliques KARR - Joue les réponses aux gros mots.

Ce module gère la lecture des répliques audio de KARR lorsqu'un gros mot
est détecté. Les répliques sont pré-générées et stockées dans state/karr_replies/.
"""
from __future__ import annotations

import random
import subprocess
import threading
from pathlib import Path

from PyQt5.QtCore import QObject, pyqtSlot

from . import paths
from .karr_responses import detect_swear, get_all_categories

# Répertoire des répliques audio
_REPLIES_DIR = paths.STATE_DIR / "karr_replies"


class KarrPlayer(QObject):
    """Lecteur de répliques KARR exposé à QML.
    
    Ce singleton détecte les gros mots dans le texte et joue aléatoirement
    une réplique audio de KARR en réponse.
    """
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._last_category: str | None = None
        self._last_reply_index: int | None = None
    
    def _get_random_reply_path(self, category: str) -> Path | None:
        """Retourne le chemin d'une réplique aléatoire pour une catégorie.
        
        Args:
            category: La catégorie de gros mot
            
        Returns:
            Chemin du fichier audio, ou None si non trouvé
        """
        if not _REPLIES_DIR.exists():
            return None
        
        # Chercher tous les fichiers de cette catégorie
        pattern = f"{category}_*.wav"
        files = list(_REPLIES_DIR.glob(pattern))
        
        if not files:
            return None
        
        # Choisir aléatoirement, éviter de répéter la même
        available = files
        if len(files) > 1 and self._last_category == category:
            # Exclure la dernière réplique jouée
            available = [f for f in files if f not in files[self._last_reply_index:self._last_reply_index+1]]
        
        chosen = random.choice(available)
        self._last_reply_index = files.index(chosen)
        return chosen
    
    def _play_audio(self, audio_path: Path) -> None:
        """Joue un fichier audio via ffplay.
        
        Args:
            audio_path: Chemin du fichier audio à jouer
        """
        try:
            subprocess.Popen(
                [
                    "ffplay",
                    "-nodisp",
                    "-autoexit",
                    "-loglevel", "quiet",
                    "-volume", "85",
                    str(audio_path)
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except (OSError, FileNotFoundError):
            pass
    
    @pyqtSlot(str, result=bool)
    def checkAndPlay(self, text: str) -> bool:
        """Vérifie si le texte contient un gros mot et joue une réplique.
        
        Cette méthode est appelée depuis QML après la reconnaissance vocale
        ou la saisie texte. Si un gros mot est détecté, une réplique KARR
        est jouée automatiquement.
        
        Args:
            text: Le texte à analyser
            
        Returns:
            True si un gros mot a été détecté et une réplique jouée
        """
        if not text:
            return False
        
        # Détecter le gros mot
        category = detect_swear(text)
        if not category:
            return False
        
        # Jouer une réplique
        self.playReply(category)
        return True
    
    @pyqtSlot(str)
    def playReply(self, category: str) -> None:
        """Joue une réplique aléatoire pour une catégorie donnée.
        
        Args:
            category: La catégorie de réplique à jouer
        """
        self._last_category = category
        
        # Chercher le fichier audio
        audio_path = self._get_random_reply_path(category)
        
        if audio_path and audio_path.exists():
            # Jouer en arrière-plan pour ne pas bloquer l'UI
            threading.Thread(
                target=self._play_audio,
                args=(audio_path,),
                daemon=True
            ).start()
    
    @pyqtSlot(result=list)
    def getCategories(self) -> list:
        """Retourne la liste des catégories de gros mots disponibles."""
        return get_all_categories()
    
    @pyqtSlot(result=bool)
    def hasReplies(self) -> bool:
        """Vérifie si les répliques audio sont disponibles."""
        if not _REPLIES_DIR.exists():
            return False
        
        # Vérifier qu'il y a au moins quelques fichiers
        wav_files = list(_REPLIES_DIR.glob("*.wav"))
        return len(wav_files) > 10
    
    @pyqtSlot()
    def playRandomTest(self) -> None:
        """Joue une réplique aléatoire pour test."""
        categories = get_all_categories()
        if categories:
            category = random.choice(categories)
            self.playReply(category)


# Singleton instance
_karr_player: KarrPlayer | None = None


def get_player() -> KarrPlayer:
    """Retourne l'instance singleton du lecteur KARR."""
    global _karr_player
    if _karr_player is None:
        _karr_player = KarrPlayer()
    return _karr_player
