#!/bin/bash
# setup_piper_train.sh — Installe piper_train + PyTorch CUDA sur Jetson JetPack 6
set -e

echo "=== 1. Dépendances système ==="
sudo apt-get install -y espeak-ng espeak-ng-data libespeak-ng-dev build-essential cmake git -q

echo "=== 2. PyTorch CUDA pour JetPack 6 (ARM64) ==="
cd /tmp
TORCH_WHL="torch-2.5.0a0+872d972e41.nv24.08.17622132-cp310-cp310-linux_aarch64.whl"
if ! python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    wget -q --show-progress \
        "https://developer.download.nvidia.com/compute/redist/jp/v62/pytorch/${TORCH_WHL}" \
        -O /tmp/torch_cuda.whl
    pip3 install /tmp/torch_cuda.whl
    echo "PyTorch CUDA installé."
else
    echo "PyTorch CUDA déjà OK."
fi

echo "=== 3. piper-phonemize depuis les sources (ARM64) ==="
if ! python3 -c "import piper_phonemize" 2>/dev/null; then
    cd /tmp
    rm -rf piper-phonemize
    git clone --depth 1 https://github.com/rhasspy/piper-phonemize
    cd piper-phonemize
    pip3 install . -q
    echo "piper-phonemize installé."
else
    echo "piper-phonemize déjà OK."
fi

echo "=== 4. pytorch-lightning + piper_train ==="
pip3 install -q pytorch-lightning==1.9.0
pip3 install -q 'git+https://github.com/rhasspy/piper.git#egg=piper_train&subdirectory=src/python' --no-deps

echo "=== 5. Vérification ==="
python3 -c "
import torch, piper_phonemize, pytorch_lightning
print('torch:', torch.__version__, '| CUDA:', torch.cuda.is_available())
print('piper_phonemize: OK')
print('pytorch_lightning:', pytorch_lightning.__version__)
"

echo ""
echo "=== TOUT OK — Lance l'entraînement avec : ==="
echo "  nohup bash /home/kitt/piper/train/train_guy_nodocker.sh > /home/kitt/piper/train/train.log 2>&1 &"
