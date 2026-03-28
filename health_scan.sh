#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║   KITT/KARR — Health Scan v1.0                                      ║
# ║   Scan santé NVMe + filesystem + SoC — ultra-léger                  ║
# ║   nice 19 + ionice idle — impact CPU/IO quasi nul                   ║
# ║   Copyright 2026 Emmanuel Gelinne (Manix)                           ║
# ╚══════════════════════════════════════════════════════════════════════╝
# Usage : bash health_scan.sh [--silent]
# Résultat : /home/kitt/kitt-ai/logs/health_scan.log

SILENT=0
[ "${1}" = "--silent" ] && SILENT=1

LOG="/home/kitt/kitt-ai/logs/health_scan.log"
ALERT_LOG="/home/kitt/kitt-ai/logs/health_alerts.log"
NVME="/dev/nvme0"
mkdir -p "$(dirname "$LOG")"

# Priorité ultra-basse (ne concurrence pas KITT/KARR)
renice -n 19 $$ > /dev/null 2>&1
ionice -c 3 -p $$ > /dev/null 2>&1

RED='\033[1;31m'
GRN='\033[1;32m'
YLW='\033[1;33m'
CYN='\033[1;36m'
WHT='\033[1;37m'
GRY='\033[0;90m'
RST='\033[0m'

ALERTS=0
WARNINGS=0

ts()    { date '+%Y-%m-%d %H:%M:%S'; }
log()   { echo "$(ts)  $1"                                              | tee -a "$LOG"; }
ok()    { echo -e "$(ts)  ${GRN}[  OK  ]${RST}  $1"                    | tee -a "$LOG"; }
warn()  { echo -e "$(ts)  ${YLW}[ WARN ]${RST}  $1"                    | tee -a "$LOG"; WARNINGS=$((WARNINGS+1)); }
alert() { echo -e "$(ts)  ${RED}[ALERT ]${RST}  $1"                    | tee -a "$LOG"; echo "$(ts) ALERT: $1" >> "$ALERT_LOG"; ALERTS=$((ALERTS+1)); }
info()  { echo -e "$(ts)  ${CYN}[ INFO ]${RST}  $1"                    | tee -a "$LOG"; }

# ── En-tête ───────────────────────────────────────────────────────────
echo "" | tee -a "$LOG"
echo "$(ts)  ══════════════════════════════════════════════════" | tee -a "$LOG"
echo "$(ts)  HEALTH SCAN — $(hostname) — $(date '+%d/%m/%Y %H:%M')"    | tee -a "$LOG"
echo "$(ts)  ══════════════════════════════════════════════════" | tee -a "$LOG"

# ── 1. NVMe SMART ─────────────────────────────────────────────────────
log "--- NVMe SMART ---"
SMART=$(sudo nvme smart-log "$NVME" 2>/dev/null) || { alert "nvme smart-log inaccessible"; SMART=""; }

if [ -n "$SMART" ]; then
    CRIT_WARN=$(echo "$SMART"  | awk '/critical_warning/{print $3}')
    TEMP_C=$(echo "$SMART"     | awk '/^temperature/{print $3}')
    SPARE=$(echo "$SMART"      | awk '/available_spare[ \t]*:/{gsub(/%/,""); print $3}' | head -1)
    USED_PCT=$(echo "$SMART"   | awk '/percentage_used/{gsub(/%/,""); print $3}')
    MEDIA_ERR=$(echo "$SMART"  | awk '/media_errors/{print $3}')
    ERR_LOG=$(echo "$SMART"    | awk '/num_err_log_entries/{print $3}')
    UNSAFE=$(echo "$SMART"     | awk '/unsafe_shutdowns/{gsub(/,/,""); print $3}')
    POH=$(echo "$SMART"        | awk '/power_on_hours/{gsub(/,/,""); print $3}')
    CYCLES=$(echo "$SMART"     | awk '/power_cycles/{gsub(/,/,""); print $3}')

    [ "${CRIT_WARN:-0}" = "0" ] \
        && ok  "Critical warning  : AUCUN" \
        || alert "Critical warning NVMe : $CRIT_WARN"

    if [ -n "$TEMP_C" ] && [ "$TEMP_C" -lt 70 ]; then
        ok   "Température NVMe  : ${TEMP_C}°C"
    elif [ -n "$TEMP_C" ]; then
        alert "NVMe surchauffe   : ${TEMP_C}°C !"
    fi

    if [ -n "$SPARE" ] && [ "$SPARE" -ge 20 ]; then
        ok   "Spare disponible  : ${SPARE}%"
    elif [ -n "$SPARE" ]; then
        warn "Spare faible      : ${SPARE}%"
    fi

    if [ -n "$USED_PCT" ] && [ "$USED_PCT" -lt 80 ]; then
        ok   "Usure NVMe        : ${USED_PCT}%"
    elif [ -n "$USED_PCT" ]; then
        warn "Usure NVMe élevée : ${USED_PCT}%"
    fi

    [ "${MEDIA_ERR:-0}" = "0" ] \
        && ok  "Erreurs media     : 0" \
        || alert "ERREURS MEDIA NVMe : $MEDIA_ERR !"

    [ "${ERR_LOG:-0}" = "0" ] \
        && ok  "Log erreurs       : 0" \
        || alert "ENTRÉES ERREUR NVMe : $ERR_LOG !"

    info "Power-on ${POH}h | Cycles ${CYCLES} | Unsafe shutdowns ${UNSAFE}"
fi

# ── 2. Espace disque ──────────────────────────────────────────────────
log "--- Espace disque ---"
DISK_USE=$(df / | awk 'NR==2{print $5}' | tr -d '%')
DISK_FREE=$(df -h / | awk 'NR==2{print $4}')
DISK_TOTAL=$(df -h / | awk 'NR==2{print $2}')

if [ "$DISK_USE" -lt 80 ]; then
    ok   "Disque /          : ${DISK_USE}% utilisé (libre ${DISK_FREE} / ${DISK_TOTAL})"
elif [ "$DISK_USE" -lt 90 ]; then
    warn "Disque /          : ${DISK_USE}% — espace faible (${DISK_FREE} libre)"
else
    alert "Disque / CRITIQUE : ${DISK_USE}% — seulement ${DISK_FREE} libre !"
fi

INODE_USE=$(df -i / | awk 'NR==2{print $5}' | tr -d '%')
[ "${INODE_USE:-0}" -lt 80 ] \
    && ok   "Inodes            : ${INODE_USE}% utilisés" \
    || warn "Inodes élevés     : ${INODE_USE}%"

# ── 3. Erreurs kernel I/O ─────────────────────────────────────────────
log "--- Erreurs kernel ---"
KERN_ERRORS=$(sudo dmesg --since "24 hours ago" 2>/dev/null \
    | grep -iE 'nvme.*error|i/o error|ata.*error|ext4.*error|filesystem.*error|buffer.*i/o|blk_update_request' \
    | wc -l)
[ "${KERN_ERRORS:-0}" -eq 0 ] \
    && ok   "Erreurs kernel I/O (24h) : 0" \
    || alert "Erreurs kernel I/O : $KERN_ERRORS occurrences !"

FSCK_ERRORS=$(sudo journalctl -k --since "24 hours ago" 2>/dev/null \
    | grep -iE 'ext4.*error|xfs.*error|corrupt|bad superblock' \
    | wc -l)
[ "${FSCK_ERRORS:-0}" -eq 0 ] \
    && ok   "Erreurs filesystem journal (24h) : 0" \
    || warn "Événements filesystem journal : $FSCK_ERRORS"

# ── 4. Températures SoC ───────────────────────────────────────────────
log "--- Températures SoC ---"
TMAX=0
for zone in /sys/class/thermal/thermal_zone*/temp; do
    T=$(cat "$zone" 2>/dev/null || echo "0")
    T_C=$((T/1000))
    [ "$T_C" -gt "$TMAX" ] && TMAX=$T_C
done
if [ "$TMAX" -lt 75 ]; then
    ok   "Température SoC max : ${TMAX}°C"
elif [ "$TMAX" -lt 85 ]; then
    warn "SoC chaud           : ${TMAX}°C"
else
    alert "SoC surchauffe      : ${TMAX}°C !"
fi

# ── 5. RAM ────────────────────────────────────────────────────────────
log "--- Mémoire ---"
RAM_FREE_MB=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
RAM_TOTAL_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
RAM_USE_PCT=$(( (RAM_TOTAL_MB - RAM_FREE_MB) * 100 / RAM_TOTAL_MB ))
# Seuil en MB libre (pas %) — LLM charge ~5-9GB, le % est toujours élevé
if [ "$RAM_FREE_MB" -gt 150 ]; then
    ok   "RAM               : ${RAM_USE_PCT}% (libre ${RAM_FREE_MB} MB / ${RAM_TOTAL_MB} MB)"
elif [ "$RAM_FREE_MB" -gt 80 ]; then
    warn "RAM faible        : ${RAM_FREE_MB} MB libre (${RAM_USE_PCT}%)"
else
    alert "RAM CRITIQUE      : seulement ${RAM_FREE_MB} MB libre !"
fi

# ── 6. Fichiers critiques KITT ────────────────────────────────────────
log "--- Fichiers critiques ---"
CRITICAL_FILES=(
    "/home/kitt/kitt-ai/kyronex_server.py"
    "/home/kitt/kitt-ai/start_kyronex.sh"
    "/home/kitt/kitt-ai/static/index.html"
    "/home/kitt/kitt-ai/models/guy_chapelier.onnx"
    "/home/kitt/kitt-ai/cross_backup.sh"
    "/home/kitt/.env.tunnel"
)
for f in "${CRITICAL_FILES[@]}"; do
    if [ -f "$f" ] && [ -s "$f" ]; then
        ok   "Fichier OK : $(basename $f)"
    elif [ -f "$f" ]; then
        alert "FICHIER VIDE      : $f !"
    else
        alert "FICHIER MANQUANT  : $f !"
    fi
done

# ── 7. Scan léger filesystem (fichiers vides suspects) ────────────────
log "--- Scan filesystem léger ---"
ZERO_FILES=$(nice -n 19 find /home/kitt/kitt-ai -maxdepth 3 -mmin -60 -size 0 -type f \
    ! -name "*.log" ! -name "*.pid" 2>/dev/null | wc -l)
[ "$ZERO_FILES" -eq 0 ] \
    && ok   "Fichiers vides récents (1h) : 0" \
    || warn "Fichiers vides détectés (1h) : $ZERO_FILES"

LOG_SIZE=$(du -sh /home/kitt/kitt-ai/logs/ 2>/dev/null | cut -f1)
BACKUP_COUNT=$(ls /home/kitt/backups/*/*.tar.gz 2>/dev/null | wc -l)
info "Logs : ${LOG_SIZE:-N/A} | Backups disponibles : $BACKUP_COUNT"

# ── 8. Services critiques ─────────────────────────────────────────────
log "--- Services ---"
for svc in kitt-kyronex kitt-tunnel; do
    STATE=$(systemctl is-active "$svc" 2>/dev/null)
    [ "$STATE" = "active" ] \
        && ok   "Service $svc : active" \
        || alert "Service $svc : $STATE !"
done

# ── Résumé ────────────────────────────────────────────────────────────
echo "$(ts)  ══════════════════════════════════════════════════" | tee -a "$LOG"
if [ "$ALERTS" -gt 0 ]; then
    echo -e "$(ts)  ${RED}[ALERT]  $ALERTS ALERTE(S) | $WARNINGS avertissement(s)${RST}" | tee -a "$LOG"
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "$(ts)  ${YLW}[ WARN]  OK avec $WARNINGS avertissement(s)${RST}"             | tee -a "$LOG"
else
    echo -e "$(ts)  ${GRN}[  OK ]  SYSTEME SAIN — aucune anomalie${RST}"                 | tee -a "$LOG"
fi
echo "$(ts)  ══════════════════════════════════════════════════" | tee -a "$LOG"
echo "" | tee -a "$LOG"

[ "$SILENT" -eq 0 ] && echo -e "\n${GRY}Log : $LOG${RST}"
logger "KITT health scan: $ALERTS alertes, $WARNINGS warnings — $(hostname)"
