#!/usr/bin/env python3
"""Copie les voix Manix de KARR vers KITT/GX.

Ce script se connecte à la machine KARR (192.168.129.22) via SSH
copie tous les modèles de voix Manix trouvés vers la machine locale.

Usage:
    python3 scripts/copy_manix_voices.py
    
Les voix sont recherchées dans:
    - /home/kitt/kitt-ai/manix_dataset/
    - /home/kitt/.local/share/piper-tts/
    - /home/kitt/voices/
    - Tout fichier .pth, .pt, .onnx lié à Manix
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Configuration
KARR_HOST = "192.168.129.22"
KARR_USER = "karr"
LOCAL_VOICES_DIR = Path.home() / "KironextStudio" / "state" / "voices" / "manix"

# Répertoires à scanner sur KARR
REMOTE_PATHS = [
    "/home/kitt/kitt-ai/manix_dataset",
    "/home/kitt/.local/share/piper-tts",
    "/home/kitt/voices",
    "/home/kitt/.local/lib/python3.10/site-packages/piper",
    "/home/kitt/models",
]


def check_ssh_connection() -> bool:
    """Vérifie la connexion SSH vers KARR."""
    try:
        result = subprocess.run(
            [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=5",
                f"{KARR_USER}@{KARR_HOST}",
                "echo OK"
            ],
            capture_output=True,
            timeout=10
        )
        return result.returncode == 0 and b"OK" in result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False


def find_remote_voices() -> list[str]:
    """Trouve tous les fichiers de voix sur KARR.
    
    Returns:
        Liste des chemins distants des fichiers voix
    """
    print("🔍 Recherche des voix Manix sur KARR...")
    
    found_voices = []
    
    # Rechercher les fichiers de voix
    extensions = ["*.pth", "*.pt", "*.onnx", "*.json", "*.ckpt", "*.safetensors"]
    
    for remote_path in REMOTE_PATHS:
        for ext in extensions:
            try:
                result = subprocess.run(
                    [
                        "ssh",
                        "-o", "StrictHostKeyChecking=no",
                        "-o", "BatchMode=yes",
                        f"{KARR_USER}@{KARR_HOST}",
                        f"find {remote_path} -name '{ext}' -o -name '*manix*' 2>/dev/null | head -20"
                    ],
                    capture_output=True,
                    timeout=15
                )
                
                if result.returncode == 0:
                    paths = result.stdout.decode().strip().split("\n")
                    for path in paths:
                        path = path.strip()
                        if path and path not in found_voices:
                            found_voices.append(path)
                            
            except (OSError, subprocess.TimeoutExpired):
                continue
    
    # Chercher aussi les fichiers avec 'manix' dans le nom
    try:
        result = subprocess.run(
            [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                f"{KARR_USER}@{KARR_HOST}",
                "find /home/kitt -name '*manix*' -type f 2>/dev/null | grep -E '\.(pth|pt|onnx|json|ckpt|safetensors)$' | head -30"
            ],
            capture_output=True,
            timeout=20
        )
        
        if result.returncode == 0:
            paths = result.stdout.decode().strip().split("\n")
            for path in paths:
                path = path.strip()
                if path and path not in found_voices:
                    found_voices.append(path)
                    
    except (OSError, subprocess.TimeoutExpired):
        pass
    
    return found_voices


def copy_voice_file(remote_path: str, local_dir: Path) -> bool:
    """Copie un fichier voix depuis KARR vers local.
    
    Args:
        remote_path: Chemin distant du fichier
        local_dir: Répertoire local de destination
        
    Returns:
        True si la copie a réussi
    """
    filename = Path(remote_path).name
    local_path = local_dir / filename
    
    # Créer les sous-répertoires si nécessaire
    local_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        result = subprocess.run(
            [
                "scp",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                f"{KARR_USER}@{KARR_HOST}:{remote_path}",
                str(local_path)
            ],
            capture_output=True,
            timeout=60
        )
        
        if result.returncode == 0:
            size = local_path.stat().st_size
            print(f"  ✓ {filename} ({size:,} bytes)")
            return True
        else:
            print(f"  ✗ {filename} - {result.stderr.decode()[:100]}")
            return False
            
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"  ✗ {filename} - {e}")
        return False


def copy_voices_dataset() -> int:
    """Copie le dataset complet des voix Manix.
    
    Returns:
        Nombre de fichiers copiés
    """
    print("📦 Copie du dataset Manix...")
    
    local_dataset_dir = LOCAL_VOICES_DIR / "dataset"
    local_dataset_dir.mkdir(parents=True, exist_ok=True)
    
    # Vérifier si le dataset existe sur KARR
    try:
        result = subprocess.run(
            [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                f"{KARR_USER}@{KARR_HOST}",
                "ls -la /home/kitt/kitt-ai/manix_dataset/wavs/ 2>/dev/null | wc -l"
            ],
            capture_output=True,
            timeout=10
        )
        
        if result.returncode != 0 or b"0" in result.stdout:
            print("  ⚠️  Dataset non trouvé sur KARR")
            return 0
        
        # Compter les fichiers
        result = subprocess.run(
            [
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                f"{KARR_USER}@{KARR_HOST}",
                "ls /home/kitt/kitt-ai/manix_dataset/wavs/*.wav 2>/dev/null | wc -l"
            ],
            capture_output=True,
            timeout=10
        )
        
        count = int(result.stdout.decode().strip()) if result.returncode == 0 else 0
        print(f"  📊 {count} fichiers audio trouvés sur KARR")
        
        # Copier avec rsync pour plus d'efficacité
        print("  🔄 Copie en cours (peut prendre plusieurs minutes)...")
        
        result = subprocess.run(
            [
                "rsync",
                "-avz",
                "--progress",
                "-e", "ssh -o StrictHostKeyChecking=no -o BatchMode=yes",
                f"{KARR_USER}@{KARR_HOST}:/home/kitt/kitt-ai/manix_dataset/",
                str(local_dataset_dir) + "/"
            ],
            capture_output=True,
            timeout=300
        )
        
        if result.returncode == 0:
            # Compter les fichiers copiés
            local_count = len(list(local_dataset_dir.rglob("*.wav")))
            print(f"  ✓ {local_count} fichiers copiés")
            return local_count
        else:
            print(f"  ✗ Échec de la copie: {result.stderr.decode()[:200]}")
            return 0
            
    except (OSError, subprocess.TimeoutExpired, ValueError) as e:
        print(f"  ✗ Erreur: {e}")
        return 0


def main():
    """Point d'entrée principal."""
    print("=" * 60)
    print("🎙️  Copie des voix Manix de KARR vers KITT")
    print("=" * 60)
    print()
    
    # Vérifier la connexion
    print("🌐 Vérification de la connexion SSH...")
    if not check_ssh_connection():
        print("❌ Impossible de se connecter à KARR")
        print(f"   Vérifiez: ssh {KARR_USER}@{KARR_HOST}")
        sys.exit(1)
    print("✓ Connexion SSH OK")
    print()
    
    # Créer le répertoire local
    LOCAL_VOICES_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📁 Répertoire local: {LOCAL_VOICES_DIR}")
    print()
    
    # Étape 1: Copier le dataset complet
    dataset_count = copy_voices_dataset()
    print()
    
    # Étape 2: Trouver et copier les modèles de voix
    print("🔍 Recherche des modèles de voix...")
    voice_files = find_remote_voices()
    
    if not voice_files:
        print("⚠️  Aucun fichier de voix trouvé sur KARR")
    else:
        print(f"📝 {len(voice_files)} fichiers trouvés")
        print()
        
        # Copier chaque fichier
        copied = 0
        failed = 0
        
        for remote_path in voice_files:
            if copy_voice_file(remote_path, LOCAL_VOICES_DIR / "models"):
                copied += 1
            else:
                failed += 1
        
        print()
        print(f"📊 Résumé: {copied} copiés, {failed} échoués")
    
    # Résumé final
    print()
    print("=" * 60)
    print("✅ Copie terminée!")
    print("=" * 60)
    print()
    print(f"📁 Fichiers dans: {LOCAL_VOICES_DIR}")
    print()
    
    # Lister les fichiers copiés
    if LOCAL_VOICES_DIR.exists():
        all_files = list(LOCAL_VOICES_DIR.rglob("*"))
        files = [f for f in all_files if f.is_file()]
        total_size = sum(f.stat().st_size for f in files)
        
        print(f"📊 Total: {len(files)} fichiers ({total_size / 1024 / 1024:.1f} MB)")
        print()
        
        # Afficher la structure
        print("📂 Structure:")
        for subdir in sorted(set(f.parent.relative_to(LOCAL_VOICES_DIR) for f in files)):
            subdir_files = [f for f in files if f.parent.relative_to(LOCAL_VOICES_DIR) == subdir]
            print(f"  {subdir}/: {len(subdir_files)} fichiers")


if __name__ == "__main__":
    main()
