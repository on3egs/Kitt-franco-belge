#!/bin/bash
# train_guy_nodocker.sh — Entraînement Piper sans Docker
DATASET="/home/kitt/piper/train/dataset"
MODEL="/home/kitt/piper/train/model_guy"
PREPROCESSED="$MODEL/preprocessed"
LOGS="$MODEL/lightning_logs"

mkdir -p "$MODEL" "$LOGS"

echo "[$(date)] === Démarrage entraînement Guy Chapelier ==="

echo "[$(date)] Prétraitement..."
python3 -m piper_train.preprocess \
    --language fr \
    --input-dir "$DATASET" \
    --output-dir "$PREPROCESSED" \
    --dataset-format ljspeech \
    --sample-rate 22050

echo "[$(date)] Entraînement (200 epochs)..."
python3 -m piper_train \
    --dataset-dir "$PREPROCESSED" \
    --accelerator gpu \
    --devices 1 \
    --batch-size 16 \
    --validation-split 0.05 \
    --num-test-examples 3 \
    --max_epochs 200 \
    --output-dir "$LOGS" \
    --precision 16-mixed \
    --checkpoint-epochs 25

echo "[$(date)] Export ONNX..."
CKPT=$(ls -t "$LOGS/version_0/checkpoints/"*.ckpt 2>/dev/null | head -1)
if [ -z "$CKPT" ]; then
    echo "ERREUR : aucun checkpoint trouvé"
    exit 1
fi

python3 -m piper_train.export_onnx \
    --checkpoint "$CKPT" \
    --output "$MODEL/guy_chapelier.onnx"

cp "$PREPROCESSED/config.json" "$MODEL/guy_chapelier.onnx.json" 2>/dev/null || true

echo "[$(date)] === TERMINÉ ==="
echo "Modèle : $MODEL/guy_chapelier.onnx"
