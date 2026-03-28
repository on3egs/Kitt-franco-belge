#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║   KARR — Sauvegarde Croisée v1.0                                    ║
# ║   Sauvegarde locale + copie miroir vers KITT (192.168.129.22)       ║
# ║   Copyright 2026 Emmanuel Gelinne (Manix)                           ║
# ╚══════════════════════════════════════════════════════════════════════╝

set -eo pipefail

KITT_HOME="/home/kitt"
KITT_DIR="/home/kitt/kitt-ai"
REMOTE_IP="192.168.129.22"
REMOTE_USER="kitt"
LOCAL_BACKUP_DIR="${KITT_HOME}/backups/karr_local"
MIRROR_DIR="${KITT_HOME}/backups/kitt_mirror"    # reçoit les backups de KITT
REMOTE_RECEIVE_DIR="${KITT_HOME}/backups/karr_mirror"  # dossier sur KITT où on envoie
LOG="/tmp/cross_backup.log"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP=3

RED='\033[1;31m'; GRN='\033[1;32m'; YLW='\033[1;33m'; WHT='\033[1;37m'; RST='\033[0m'
log()  { echo -e "  ${WHT}[..]${RST}  $1" | tee -a "$LOG"; }
ok()   { echo -e "  ${GRN}[OK]${RST}  $1" | tee -a "$LOG"; }
warn() { echo -e "  ${YLW}[!!]${RST}  $1" | tee -a "$LOG"; }

echo "" | tee "$LOG"
echo -e "${RED}  ██╗  ██╗██╗████████╗████████╗  CROSS-BACKUP${RST}" | tee -a "$LOG"
echo -e "${WHT}  KARR (.23) → local + miroir KITT (.22)${RST}" | tee -a "$LOG"
echo -e "${RED}  ══════════════════════════════════════════${RST}" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# ── 1. Dossiers locaux ────────────────────────────────────────────────
mkdir -p "$LOCAL_BACKUP_DIR" "$MIRROR_DIR"

# ── 2. Sauvegarde locale ──────────────────────────────────────────────
log "Étape 1/3 — Sauvegarde locale KARR..."
BACKUP_NAME="karr_backup_${DATE}.tar.gz"
BACKUP_PATH="${LOCAL_BACKUP_DIR}/${BACKUP_NAME}"

ITEMS=()
[ -f "${KITT_DIR}/memory.json" ]    && ITEMS+=("kitt-ai/memory.json")
[ -f "${KITT_DIR}/users.json" ]     && ITEMS+=("kitt-ai/users.json")
[ -d "${KITT_DIR}/user_memories" ]  && ITEMS+=("kitt-ai/user_memories")
[ -d "${KITT_DIR}/knowledge" ]      && ITEMS+=("kitt-ai/knowledge")
[ -d "${KITT_DIR}/certs" ]          && ITEMS+=("kitt-ai/certs")
[ -f "${KITT_HOME}/.env.tunnel" ]   && ITEMS+=(".env.tunnel")
[ -f "${KITT_DIR}/kyronex_server.py" ] && ITEMS+=("kitt-ai/kyronex_server.py")
[ -f "${KITT_DIR}/start_kyronex.sh" ]  && ITEMS+=("kitt-ai/start_kyronex.sh")
[ -f "${KITT_DIR}/static/index.html" ] && ITEMS+=("kitt-ai/static/index.html")
[ -d "${KITT_DIR}/rag" ]            && ITEMS+=("kitt-ai/rag")
[ -f "${KITT_HOME}/.bashrc" ]       && ITEMS+=(".bashrc")

cat > "${KITT_HOME}/backup_meta.txt" << EOF
KARR Backup — $(date '+%d/%m/%Y %H:%M:%S')
Host: $(hostname) | IP: $(hostname -I | awk '{print $1}')
Model: Qwen2.5-7B | Piper: guy_chapelier.onnx | ctx=4096
Git: $(cd ${KITT_DIR} && git rev-parse --short HEAD 2>/dev/null || echo N/A)
EOF
ITEMS+=("backup_meta.txt")

cd "${KITT_HOME}"
tar -czf "${BACKUP_PATH}" "${ITEMS[@]}" 2>>"$LOG"
rm -f "${KITT_HOME}/backup_meta.txt"
SIZE=$(du -sh "${BACKUP_PATH}" | cut -f1)
ok "Archive locale : ${BACKUP_NAME} (${SIZE})"

# Garder seulement les N derniers
ls -t "${LOCAL_BACKUP_DIR}"/karr_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ok "Anciens backups nettoyés (garde ${KEEP} derniers)"

# ── 3. Copie miroir vers KITT (.22) ───────────────────────────────────
log "Étape 2/3 — Copie miroir vers KITT (192.168.129.22)..."
if ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" "mkdir -p ${REMOTE_RECEIVE_DIR}" 2>>"$LOG"; then
    if scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
        "${BACKUP_PATH}" \
        "${REMOTE_USER}@${REMOTE_IP}:${REMOTE_RECEIVE_DIR}/${BACKUP_NAME}" 2>>"$LOG"; then
        ok "Miroir copié sur KITT : ${REMOTE_RECEIVE_DIR}/${BACKUP_NAME}"
        # Nettoyer anciens miroirs sur KITT aussi
        ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_IP}" \
            "ls -t ${REMOTE_RECEIVE_DIR}/karr_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f" 2>>"$LOG" || true
    else
        warn "Impossible de copier vers KITT — vérifier réseau"
    fi
else
    warn "KITT (.22) injoignable — backup local conservé"
fi

# ── 4. Récupération du dernier backup de KITT ────────────────────────
log "Étape 3/3 — Récupération miroir depuis KITT..."
KITT_LATEST=$(ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
    "${REMOTE_USER}@${REMOTE_IP}" \
    "ls -t /home/kitt/backups/kitt_local/kitt_backup_*.tar.gz 2>/dev/null | head -1" 2>>"$LOG" || echo "")

if [ -n "$KITT_LATEST" ]; then
    KITT_NAME=$(basename "$KITT_LATEST")
    scp -o ConnectTimeout=15 -o StrictHostKeyChecking=no \
        "${REMOTE_USER}@${REMOTE_IP}:${KITT_LATEST}" \
        "${MIRROR_DIR}/${KITT_NAME}" 2>>"$LOG" && \
        ok "Miroir KITT reçu : ${KITT_NAME}" || \
        warn "Impossible de récupérer le miroir KITT"
    ls -t "${MIRROR_DIR}"/kitt_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
else
    warn "Aucun backup KITT disponible encore"
fi

# ── Résumé ────────────────────────────────────────────────────────────
echo "" | tee -a "$LOG"
echo -e "${GRN}  ══ CROSS-BACKUP KARR TERMINÉ ══${RST}" | tee -a "$LOG"
echo -e "  Local  : ${WHT}${BACKUP_PATH}${RST}" | tee -a "$LOG"
echo -e "  Miroir : ${WHT}${REMOTE_USER}@${REMOTE_IP}:${REMOTE_RECEIVE_DIR}/${BACKUP_NAME}${RST}" | tee -a "$LOG"
echo "" | tee -a "$LOG"
logger "KARR cross-backup OK : ${BACKUP_NAME} (${SIZE})"
