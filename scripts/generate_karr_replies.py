#!/usr/bin/env python3
"""Génère les répliques audio de KARR pour les gros mots.

Ce script génère tous les fichiers audio pour les 50 réponses de chaque
catégorie de gros mots, en utilisant Piper TTS avec une voix masculine grave
style KARR (cynique, robotique, menaçante).

Usage:
    python3 scripts/generate_karr_replies.py
    
Les fichiers sont générés dans: state/karr_replies/
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

# Ajouter le parent au path pour importer kyronext
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from kyronext.karr_responses import _KARR_REPLIES, get_stats, total_replies
from kyronext import paths

# Répertoire de sortie
OUTPUT_DIR = paths.STATE_DIR / "karr_replies"

# Voix Piper à utiliser (VOIX GUY CHAPELIER - dernière version)
# Voix officielle de KITT, créée par Manix
PIPER_MODEL = "/home/kitt/kitt-ai/models/guy_chapelier_v3.onnx"


def check_piper() -> bool:
    """Vérifie si Piper TTS est installé."""
    try:
        result = subprocess.run(
            ["piper", "--help"],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def generate_speech(text: str, output_path: Path, voice_id: str = PIPER_MODEL) -> bool:
    """Génère un fichier audio avec Piper TTS.
    
    Args:
        text: Le texte à synthétiser
        output_path: Chemin du fichier de sortie WAV
        voice_id: Identifiant de la voix Piper
        
    Returns:
        True si la génération a réussi
    """
    try:
        # Utiliser piper pour générer l'audio
        # On ajuste la vitesse pour un effet plus robotique/KARR
        proc = subprocess.run(
            [
                "piper",
                "--model", voice_id,
                "--output_file", str(output_path),
                "--sentence-silence", "0.2",
            ],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=30
        )
        
        if proc.returncode != 0:
            print(f"  Erreur Piper: {proc.stderr.decode()}")
            return False
            
        # Vérifier que le fichier a été créé
        if not output_path.exists() or output_path.stat().st_size == 0:
            return False
            
        return True
        
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"  Exception: {e}")
        return False


def generate_all_replies(force: bool = False) -> int:
    """Génère tous les fichiers audio des répliques KARR.
    
    Args:
        force: Si True, régénère même les fichiers existants
        
    Returns:
        Nombre de fichiers générés
    """
    if not check_piper():
        print("❌ Piper TTS n'est pas installé.")
        print("   Installez-le avec: pip install piper-tts")
        return 0
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    total = total_replies()
    generated = 0
    skipped = 0
    failed = 0
    
    print(f"=== Génération des répliques KARR ===")
    print(f"Total à générer: {total} répliques")
    print(f"Répertoire: {OUTPUT_DIR}")
    print(f"Voix: {PIPER_MODEL}")
    print()
    
    for category, replies in _KARR_REPLIES.items():
        print(f"\n📁 Catégorie: {category} ({len(replies)} répliques)")
        
        for i, reply in enumerate(replies, 1):
            # Nom de fichier: {category}_{num:03d}.wav
            filename = f"{category}_{i:03d}.wav"
            output_path = OUTPUT_DIR / filename
            
            # Vérifier si déjà existant
            if output_path.exists() and not force:
                print(f"  [{i}/{len(replies)}] ⏭️  {filename} (déjà présent)")
                skipped += 1
                continue
            
            # Générer l'audio
            print(f"  [{i}/{len(replies)}] 🎙️  {filename}", end="", flush=True)
            
            if generate_speech(reply, output_path):
                print(f" ✓ ({output_path.stat().st_size} bytes)")
                generated += 1
            else:
                print(f" ✗ ÉCHEC")
                failed += 1
            
            # Petite pause pour ne pas surcharger
            time.sleep(0.1)
    
    print(f"\n=== Résumé ===")
    print(f"  Générés: {generated}")
    print(f"  Ignorés: {skipped}")
    print(f"  Échoués: {failed}")
    print(f"  Total:   {generated + skipped + failed}")
    
    return generated


def generate_single_category(category: str, force: bool = False) -> int:
    """Génère les fichiers audio pour une seule catégorie.
    
    Args:
        category: La catégorie à générer
        force: Si True, régénère même les fichiers existants
        
    Returns:
        Nombre de fichiers générés
    """
    if category not in _KARR_REPLIES:
        print(f"❌ Catégorie inconnue: {category}")
        print(f"Catégories disponibles: {list(_KARR_REPLIES.keys())}")
        return 0
    
    if not check_piper():
        print("❌ Piper TTS n'est pas installé.")
        return 0
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    replies = _KARR_REPLIES[category]
    generated = 0
    
    print(f"=== Génération: {category} ({len(replies)} répliques) ===")
    
    for i, reply in enumerate(replies, 1):
        filename = f"{category}_{i:03d}.wav"
        output_path = OUTPUT_DIR / filename
        
        if output_path.exists() and not force:
            print(f"  [{i}/{len(replies)}] ⏭️  {filename} (déjà présent)")
            continue
        
        print(f"  [{i}/{len(replies)}] 🎙️  {filename}", end="", flush=True)
        
        if generate_speech(reply, output_path):
            print(f" ✓")
            generated += 1
        else:
            print(f" ✗")
        
        time.sleep(0.1)
    
    print(f"\nGénérés: {generated}/{len(replies)}")
    return generated


def list_categories():
    """Affiche les catégories et leurs statistiques."""
    print("=== Catégories de gros mots ===")
    for cat, count in get_stats().items():
        print(f"  {cat:15s}: {count:3d} répliques")
    print(f"\nTotal: {total_replies()} répliques")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Génère les répliques audio de KARR pour les gros mots"
    )
    parser.add_argument(
        "--category", "-c",
        help="Génère uniquement cette catégorie"
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Régénère même les fichiers existants"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="Liste les catégories et quitte"
    )
    
    args = parser.parse_args()
    
    if args.list:
        list_categories()
    elif args.category:
        generate_single_category(args.category, args.force)
    else:
        generate_all_replies(args.force)
