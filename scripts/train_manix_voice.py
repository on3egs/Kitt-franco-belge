#!/usr/bin/env python3
"""Entraînement des voix Manix - 2000 époques.

Ce script lance l'entraînement des modèles de voix Manix avec 2000 époques
pour obtenir une qualité optimale. Détection automatique du GPU (AGX Xavier vs Orin).

Usage:
    python3 scripts/train_manix_voice.py [--model MODEL] [--epochs 2000]

Options:
    --model: Le modèle à entraîner (v1, v2, v3, ou all)
    --epochs: Nombre d'époques (défaut: 2000)
    --auto-detect: Détecte automatiquement le GPU et optimise les paramètres
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# Configuration
VOICES_DIR = Path.home() / "KironextStudio" / "state" / "voices" / "manix"
CHECKPOINTS_DIR = VOICES_DIR / "checkpoints"
OUTPUT_DIR = VOICES_DIR / "trained"

@dataclass
class GPUConfig:
    """Configuration GPU pour l'entraînement."""
    name: str
    cuda_cores: int
    tensor_cores: int
    memory_gb: int
    batch_size: int
    learning_rate: float
    num_workers: int
    mixed_precision: bool
    estimated_hours_per_1k_epochs: float


# Configurations prédéfinies par GPU
GPU_PROFILES = {
    "agx_xavier": GPUConfig(
        name="Jetson AGX Xavier",
        cuda_cores=512,
        tensor_cores=64,
        memory_gb=32,
        batch_size=4,  # Plus petit batch pour mémoire limitée
        learning_rate=0.0001,
        num_workers=2,
        mixed_precision=False,  # Volta n'a pas les meilleures perf FP16
        estimated_hours_per_1k_epochs=6.0,
    ),
    "agx_orin": GPUConfig(
        name="Jetson AGX Orin",
        cuda_cores=2048,
        tensor_cores=64,
        memory_gb=32,
        batch_size=16,  # Batch plus grand grâce à plus de cœurs
        learning_rate=0.0002,
        num_workers=4,
        mixed_precision=True,  # Ampère excelle en FP16
        estimated_hours_per_1k_epochs=1.2,
    ),
    "orin_nx": GPUConfig(
        name="Jetson Orin NX",
        cuda_cores=1024,
        tensor_cores=32,
        memory_gb=16,
        batch_size=8,
        learning_rate=0.00015,
        num_workers=3,
        mixed_precision=True,
        estimated_hours_per_1k_epochs=2.5,
    ),
    "orin_nano": GPUConfig(
        name="Jetson Orin Nano",
        cuda_cores=512,
        tensor_cores=16,
        memory_gb=8,
        batch_size=4,
        learning_rate=0.0001,
        num_workers=2,
        mixed_precision=True,
        estimated_hours_per_1k_epochs=4.0,
    ),
    "generic": GPUConfig(
        name="GPU Générique/PC",
        cuda_cores=0,
        tensor_cores=0,
        memory_gb=0,
        batch_size=8,
        learning_rate=0.0001,
        num_workers=2,
        mixed_precision=False,
        estimated_hours_per_1k_epochs=3.0,
    ),
}


def detect_jetson_model() -> tuple[str, GPUConfig]:
    """Détecte le modèle de Jetson et retourne la configuration GPU appropriée.
    
    Returns:
        Tuple (model_key, gpu_config)
    """
    device_model = "Unknown"
    
    # Méthode 1: /proc/device-tree/model
    try:
        result = subprocess.run(
            ["cat", "/proc/device-tree/model"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            device_model = result.stdout.strip().replace("\x00", "")
    except (OSError, subprocess.TimeoutExpired):
        pass
    
    # Méthode 2: /etc/nv_tegra_release
    tegra_version = None
    try:
        result = subprocess.run(
            ["cat", "/etc/nv_tegra_release"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            tegra_version = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    
    # Méthode 3: tegrastats (pour info sur le GPU)
    gpu_info = {}
    try:
        result = subprocess.run(
            ["tegrastats", "--version"],
            capture_output=True,
            timeout=2
        )
        if result.returncode == 0:
            # tegrastats disponible = on est sur un Jetson
            pass
    except (OSError, subprocess.TimeoutExpired):
        pass
    
    # Détection basée sur le modèle
    model_lower = device_model.lower()
    
    if "orin" in model_lower:
        if "agx" in model_lower or "64gb" in model_lower:
            return "agx_orin", GPU_PROFILES["agx_orin"]
        elif "nx" in model_lower:
            return "orin_nx", GPU_PROFILES["orin_nx"]
        elif "nano" in model_lower:
            return "orin_nano", GPU_PROFILES["orin_nano"]
        else:
            # Orin non identifié précisément, utiliser config NX par défaut
            return "orin_unknown", GPU_PROFILES["orin_nx"]
    
    elif "xavier" in model_lower:
        if "agx" in model_lower or "32gb" in model_lower:
            return "agx_xavier", GPU_PROFILES["agx_xavier"]
        elif "nx" in model_lower:
            # Xavier NX a 384 cœurs CUDA
            config = GPU_PROFILES["agx_xavier"]
            return "xavier_nx", GPUConfig(
                name="Jetson Xavier NX",
                cuda_cores=384,
                tensor_cores=48,
                memory_gb=16,
                batch_size=6,
                learning_rate=0.0001,
                num_workers=2,
                mixed_precision=False,
                estimated_hours_per_1k_epochs=8.0,
            )
        elif "nano" in model_lower:
            return "xavier_nano", GPU_PROFILES["orin_nano"]  # Similaire perf
    
    # Détection par lspci pour GPU desktop
    try:
        result = subprocess.run(
            ["lspci"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and "nvidia" in result.stdout.lower():
            return "desktop_nvidia", GPU_PROFILES["generic"]
    except (OSError, subprocess.TimeoutExpired):
        pass
    
    # Fallback: vérifier si torch voit un GPU
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            if "orin" in gpu_name.lower():
                return "agx_orin_torch", GPU_PROFILES["agx_orin"]
            elif "xavier" in gpu_name.lower() or "volta" in gpu_name.lower():
                return "agx_xavier_torch", GPU_PROFILES["agx_xavier"]
    except ImportError:
        pass
    
    # Défaut: si on est sur un Jetson mais non identifié
    if tegra_version or "jetson" in model_lower:
        print(f"⚠️  Jetson détecté mais modèle non identifié: {device_model}")
        print("   Utilisation de la configuration AGX Xavier par défaut")
        return "unknown_jetson", GPU_PROFILES["agx_xavier"]
    
    return "generic", GPU_PROFILES["generic"]


def print_gpu_info(model_key: str, config: GPUConfig, epochs: int):
    """Affiche les informations du GPU et l'estimation de temps."""
    print("=" * 60)
    print("🎮 GPU Détecté")
    print("=" * 60)
    print(f"  Modèle: {config.name} ({model_key})")
    print(f"  Cœurs CUDA: {config.cuda_cores}")
    print(f"  Tensor Cores: {config.tensor_cores}")
    print(f"  Mémoire: {config.memory_gb} GB")
    print()
    print("⚙️  Configuration d'entraînement:")
    print(f"  Batch size: {config.batch_size}")
    print(f"  Learning rate: {config.learning_rate}")
    print(f"  Mixed precision: {'Oui' if config.mixed_precision else 'Non'}")
    print(f"  Workers: {config.num_workers}")
    print()
    
    # Estimation du temps
    total_hours = (epochs / 1000) * config.estimated_hours_per_1k_epochs
    if total_hours < 1:
        print(f"⏱️  Temps estimé: {int(total_hours * 60)} minutes")
    else:
        hours = int(total_hours)
        mins = int((total_hours - hours) * 60)
        print(f"⏱️  Temps estimé: {hours}h {mins}min")
    print()


# Modèles disponibles
MODELS = {
    "v1": {
        "name": "Manix V1 (Base)",
        "dataset": VOICES_DIR / "dataset" / "v1",
        "config": VOICES_DIR / "configs" / "manix_v1.json",
    },
    "v2": {
        "name": "Manix V2 (Amélioré)",
        "dataset": VOICES_DIR / "dataset" / "v2", 
        "config": VOICES_DIR / "configs" / "manix_v2.json",
    },
    "v3": {
        "name": "Manix V3 (Premium)",
        "dataset": VOICES_DIR / "dataset" / "v3",
        "config": VOICES_DIR / "configs" / "manix_v3.json",
    },
}


def check_requirements() -> bool:
    """Vérifie que les dépendances sont installées."""
    required = ["python3", "pip"]
    
    for cmd in required:
        try:
            subprocess.run([cmd, "--version"], capture_output=True, timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            print(f"❌ {cmd} non trouvé")
            return False
    
    return True


def install_dependencies():
    """Installe les dépendances nécessaires pour l'entraînement."""
    print("📦 Installation des dépendances...")
    
    packages = [
        "torch",
        "torchaudio", 
        "piper-tts",
        "coqui-ai-TTS",
        "tensorboard",
    ]
    
    for package in packages:
        print(f"  Installing {package}...")
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-q", package],
                capture_output=True,
                timeout=120
            )
        except (OSError, subprocess.TimeoutExpired):
            print(f"  ⚠️  Impossible d'installer {package}")


def prepare_dataset(model_key: str) -> bool:
    """Prépare le dataset pour l'entraînement.
    
    Args:
        model_key: Clé du modèle (v1, v2, v3)
        
    Returns:
        True si le dataset est prêt
    """
    model_info = MODELS[model_key]
    dataset_dir = model_info["dataset"]
    
    if not dataset_dir.exists():
        print(f"❌ Dataset non trouvé: {dataset_dir}")
        print(f"   Exécutez d'abord: python3 scripts/copy_manix_voices.py")
        return False
    
    # Compter les fichiers audio
    wav_files = list(dataset_dir.rglob("*.wav"))
    mp3_files = list(dataset_dir.rglob("*.mp3"))
    total_files = len(wav_files) + len(mp3_files)
    
    if total_files == 0:
        print(f"❌ Aucun fichier audio trouvé dans {dataset_dir}")
        return False
    
    print(f"✓ Dataset prêt: {total_files} fichiers audio")
    return True


def train_model(model_key: str, epochs: int = 2000, gpu_config: GPUConfig | None = None) -> bool:
    """Lance l'entraînement d'un modèle.
    
    Args:
        model_key: Clé du modèle (v1, v2, v3)
        epochs: Nombre d'époques
        gpu_config: Configuration GPU détectée automatiquement
        
    Returns:
        True si l'entraînement a réussi
    """
    model_info = MODELS[model_key]
    
    # Utiliser config par défaut si non fournie
    if gpu_config is None:
        _, gpu_config = detect_jetson_model()
    
    print(f"\n{'='*60}")
    print(f"🎙️  Entraînement: {model_info['name']}")
    print(f"{'='*60}")
    print(f"📊 Époques: {epochs}")
    print(f"📁 Dataset: {model_info['dataset']}")
    print(f"⚙️  Config: {model_info['config']}")
    print(f"🎮 GPU Optimisé: {gpu_config.name}")
    print()
    
    if not prepare_dataset(model_key):
        return False
    
    # Créer les répertoires de sortie
    model_output = OUTPUT_DIR / model_key
    model_output.mkdir(parents=True, exist_ok=True)
    
    checkpoint_dir = CHECKPOINTS_DIR / model_key
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    
    # Calculer le temps estimé avec la config GPU
    estimated_hours = (epochs / 1000) * gpu_config.estimated_hours_per_1k_epochs
    
    # Lancer l'entraînement avec Piper ou Coqui TTS
    print("🚀 Lancement de l'entraînement...")
    if estimated_hours < 1:
        print(f"⏱️  Durée estimée: {int(estimated_hours * 60)} minutes")
    else:
        hours = int(estimated_hours)
        mins = int((estimated_hours - hours) * 60)
        print(f"⏱️  Durée estimée: {hours}h {mins}min")
    print()
    
    # Utiliser Coqui TTS pour l'entraînement avec paramètres optimisés
    train_cmd = [
        sys.executable, "-m",
        "TTS.bin.train_tts",
        "--config_path", str(model_info["config"]) if model_info["config"].exists() else "",
        "--output_path", str(model_output),
        "--num_epochs", str(epochs),
        "--batch_size", str(gpu_config.batch_size),
        "--eval_batch_size", str(max(1, gpu_config.batch_size // 2)),
        "--num_loader_workers", str(gpu_config.num_workers),
        "--save_step", "1000",
        "--save_n_checkpoints", "5",
        "--save_best_after", "5000",
    ]
    
    # Ajouter mixed precision si supporté
    if gpu_config.mixed_precision:
        train_cmd.extend(["--mixed_precision", "true"])
    
    # Fallback si pas de config: utiliser piper directement avec optimisations
    if not model_info["config"].exists():
        print("⚙️  Utilisation de Piper TTS...")
        train_cmd = [
            "piper-train",
            "--dataset-dir", str(model_info["dataset"]),
            "--checkpoint-dir", str(checkpoint_dir),
            "--epochs", str(epochs),
            "--batch-size", str(gpu_config.batch_size),
            "--learning-rate", str(gpu_config.learning_rate),
        ]
        
        if gpu_config.mixed_precision:
            train_cmd.append("--precision", "16")
    
    try:
        # Lancer l'entraînement
        process = subprocess.Popen(
            train_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # Afficher la progression en temps réel
        start_time = time.time()
        for line in process.stdout:
            line = line.strip()
            if line:
                print(f"  {line}")
                
                # Détecter la fin d'une époque
                if "Epoch" in line and "/" in line:
                    elapsed = time.time() - start_time
                    # Estimation du temps restant
                    pass
        
        process.wait()
        
        if process.returncode == 0:
            print(f"\n✅ Entraînement terminé avec succès!")
            print(f"📁 Modèle sauvegardé: {model_output}")
            return True
        else:
            print(f"\n❌ Échec de l'entraînement (code {process.returncode})")
            return False
            
    except KeyboardInterrupt:
        print("\n\n⚠️  Entraînement interrompu par l'utilisateur")
        process.terminate()
        return False
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        return False


def train_all_models(epochs: int = 2000, gpu_config: GPUConfig | None = None):
    """Entraîne tous les modèles Manix.
    
    Args:
        epochs: Nombre d'époques pour chaque modèle
        gpu_config: Configuration GPU détectée automatiquement
    """
    # Détecter GPU si non fourni
    if gpu_config is None:
        _, gpu_config = detect_jetson_model()
    
    print("=" * 60)
    print("🎙️  Entraînement de toutes les voix Manix")
    print("=" * 60)
    print(f"📊 Époques par modèle: {epochs}")
    print(f"🎮 GPU: {gpu_config.name}")
    
    # Calculer temps total estimé
    total_hours = len(MODELS) * (epochs / 1000) * gpu_config.estimated_hours_per_1k_epochs
    if total_hours < 1:
        print(f"⏱️  Durée totale estimée: {int(total_hours * 60)} minutes")
    else:
        hours = int(total_hours)
        mins = int((total_hours - hours) * 60)
        print(f"⏱️  Durée totale estimée: {hours}h {mins}min")
    print()
    
    results = {}
    
    for model_key in MODELS:
        success = train_model(model_key, epochs, gpu_config)
        results[model_key] = success
        
        if not success:
            print(f"⚠️  Échec pour {model_key}, passage au suivant...")
    
    # Résumé
    print("\n" + "=" * 60)
    print("📊 Résumé de l'entraînement")
    print("=" * 60)
    
    for model_key, success in results.items():
        status = "✅ OK" if success else "❌ Échec"
        print(f"  {MODELS[model_key]['name']}: {status}")
    
    successful = sum(1 for s in results.values() if s)
    print(f"\nTotal: {successful}/{len(MODELS)} modèles entraînés")


def main():
    """Point d'entrée principal."""
    parser = argparse.ArgumentParser(
        description="Entraîne les voix Manix avec 2000 époques"
    )
    parser.add_argument(
        "--model", "-m",
        choices=["v1", "v2", "v3", "all"],
        default="all",
        help="Modèle à entraîner (défaut: all)"
    )
    parser.add_argument(
        "--epochs", "-e",
        type=int,
        default=2000,
        help="Nombre d'époques (défaut: 2000)"
    )
    parser.add_argument(
        "--install-deps",
        action="store_true",
        help="Installe les dépendances avant l'entraînement"
    )
    parser.add_argument(
        "--detect-only",
        action="store_true",
        help="Détecte uniquement le GPU et quitte"
    )
    parser.add_argument(
        "--force-gpu",
        choices=list(GPU_PROFILES.keys()),
        help="Force l'utilisation d'une config GPU spécifique"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🎙️  Entraînement des voix Manix - KITT AI")
    print("=" * 60)
    print()
    
    # Détection GPU
    if args.force_gpu:
        model_key = args.force_gpu
        gpu_config = GPU_PROFILES[args.force_gpu]
        print(f"🎮 GPU forcé: {gpu_config.name}")
    else:
        model_key, gpu_config = detect_jetson_model()
    
    # Mode détection seule
    if args.detect_only:
        print_gpu_info(model_key, gpu_config, args.epochs)
        sys.exit(0)
    
    # Afficher les infos GPU
    print_gpu_info(model_key, gpu_config, args.epochs)
    
    # Vérifier les prérequis
    if not check_requirements():
        sys.exit(1)
    
    # Installer les dépendances si demandé
    if args.install_deps:
        install_dependencies()
    
    # Lancer l'entraînement
    if args.model == "all":
        train_all_models(args.epochs, gpu_config)
    else:
        success = train_model(args.model, args.epochs, gpu_config)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
