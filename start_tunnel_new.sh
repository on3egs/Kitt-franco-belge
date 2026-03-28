#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# KITT Franco-Belge — Tunnel avec fallback localhost.run + reconnexion auto
# ══════════════════════════════════════════════════════════════════

LOCAL_PORT="${TUNNEL_PORT:-3000}"
CF_LOG="/tmp/cloudflared.log"
LHR_LOG="/tmp/localhost_run.log"
UPDATER_LOG="/tmp/tunnel_updater.log"
UPDATER_PID_FILE="/tmp/tunnel_updater.pid"
URL_FILE="/tmp/tunnel_current_url"
CF_CHILD_PID=""
LHR_CHILD_PID=""

# ── Charger les variables d'environnement ─────────────────────────
ENV_FILE="${HOME}/.env.tunnel"
if [[ -f "$ENV_FILE" ]]; then
    set -a; source "$ENV_FILE"; set +a
    echo "[INFO] Environnement chargé depuis $ENV_FILE"
fi

# ── Nettoyage ─────────────────────────────────────────────────────
cleanup_all() {
    echo "[INFO] Arrêt complet..."
    [[ -n "${CF_CHILD_PID:-}" ]]  && kill "$CF_CHILD_PID"  2>/dev/null || true
    [[ -n "${LHR_CHILD_PID:-}" ]] && kill "$LHR_CHILD_PID" 2>/dev/null || true
    pkill -f "nokey@localhost.run" 2>/dev/null || true
    pkill -f "cloudflared tunnel"  2>/dev/null || true
    if [[ -f "$UPDATER_PID_FILE" ]]; then
        OLD=$(cat "$UPDATER_PID_FILE" 2>/dev/null || echo "")
        [[ -n "$OLD" ]] && kill "$OLD" 2>/dev/null || true
    fi
    python3 "$(dirname "$0")/tunnel_updater.py" --offline 2>/dev/null || true
    echo "[INFO] Tunnel arrêté."
    exit 0
}
trap 'cleanup_all' SIGTERM SIGINT

# ── Détection HTTPS/HTTP ───────────────────────────────────────────
KITT_DIR="$(dirname "$(realpath "$0")")"
[[ -f "$KITT_DIR/certs/cert.pem" ]] && PROTO="https" || PROTO="http"

echo ""
echo "  ██╗  ██╗██╗████████╗████████╗"
echo "  ██║ ██╔╝██║╚══██╔══╝╚══██╔══╝"
echo "  █████╔╝ ██║   ██║      ██║"
echo "  FRANCO-BELGE — TUNNEL CLOUDFLARE"
echo ""

# ── (Re)démarrer l'updater avec la nouvelle URL ───────────────────
start_updater() {
    local url="$1"
    if [[ -f "$UPDATER_PID_FILE" ]]; then
        OLD=$(cat "$UPDATER_PID_FILE" 2>/dev/null || echo "")
        [[ -n "$OLD" ]] && kill "$OLD" 2>/dev/null || true
        rm -f "$UPDATER_PID_FILE"
        sleep 1
    fi
    export CLOUDFLARE_TUNNEL_URL="$url"
    export GITHUB_TOKEN GITHUB_REPO LHR_LOG CF_LOG
    python3 "$(dirname "$0")/tunnel_updater.py" >> "$UPDATER_LOG" 2>&1 &
    echo "$!" > "$UPDATER_PID_FILE"
    echo "[INFO] tunnel_updater → $url"
}

# ── Boucle principale ─────────────────────────────────────────────
echo "[INFO] Démarrage boucle tunnel (reconnexion automatique)..."
CURRENT_URL=""

while true; do
    CF_CHILD_PID=""
    LHR_CHILD_PID=""
    TUNNEL_URL=""

    # ── Tentative cloudflared ──────────────────────────────────────
    if command -v cloudflared &>/dev/null; then
        echo "[INFO] Tentative cloudflared..."
        rm -f "$CF_LOG"
        cloudflared tunnel --metrics 127.0.0.1:8081 \
            --url "${PROTO}://localhost:${LOCAL_PORT}" --no-tls-verify \
            > "$CF_LOG" 2>&1 &
        CF_CHILD_PID=$!

        for i in $(seq 1 20); do
            if grep -q "429 Too Many Requests" "$CF_LOG" 2>/dev/null; then
                echo "[WARN] cloudflared rate-limité (429) → fallback localhost.run"
                kill "$CF_CHILD_PID" 2>/dev/null || true
                CF_CHILD_PID=""
                break
            fi
            TUNNEL_URL=$(grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | tail -1 || true)
            if [[ -n "$TUNNEL_URL" ]]; then break; fi
            kill -0 "$CF_CHILD_PID" 2>/dev/null || { CF_CHILD_PID=""; break; }
            sleep 1
        done
    fi

    # ── Fallback localhost.run ─────────────────────────────────────
    if [[ -z "$TUNNEL_URL" ]]; then
        echo "[INFO] Démarrage localhost.run..."
        rm -f "$LHR_LOG"
        ssh -o StrictHostKeyChecking=no \
            -o ServerAliveInterval=20 \
            -o ServerAliveCountMax=3 \
            -o ConnectTimeout=15 \
            -o ExitOnForwardFailure=yes \
            -R "80:localhost:${LOCAL_PORT}" \
            nokey@localhost.run \
            > "$LHR_LOG" 2>&1 &
        LHR_CHILD_PID=$!

        for i in $(seq 1 30); do
            TUNNEL_URL=$(grep -oP 'https://[a-z0-9]+\.lhr\.life' "$LHR_LOG" 2>/dev/null | tail -1 || true)
            if [[ -n "$TUNNEL_URL" ]]; then break; fi
            kill -0 "$LHR_CHILD_PID" 2>/dev/null || { LHR_CHILD_PID=""; break; }
            sleep 1
        done
    fi

    # ── URL obtenue ? ──────────────────────────────────────────────
    if [[ -n "$TUNNEL_URL" ]]; then
        echo "  ┌─────────────────────────────────────────────┐"
        echo "  │  TUNNEL ACTIF                               │"
        echo "  │  URL : $TUNNEL_URL"
        echo "  └─────────────────────────────────────────────┘"
        echo "$TUNNEL_URL" > "$URL_FILE"

        if [[ "$TUNNEL_URL" != "$CURRENT_URL" ]]; then
            CURRENT_URL="$TUNNEL_URL"
            start_updater "$CURRENT_URL"
        fi

        # Attendre que le processus actif meure
        ACTIVE_PID="${CF_CHILD_PID:-${LHR_CHILD_PID:-}}"
        if [[ -n "$ACTIVE_PID" ]]; then
            wait "$ACTIVE_PID" 2>/dev/null || true
        fi
        echo "[WARN] Tunnel déconnecté — reconnexion dans 5s..."
    else
        echo "[ERR] Aucune URL obtenue — retry dans 30s..."
        [[ -n "${CF_CHILD_PID:-}" ]]  && kill "$CF_CHILD_PID"  2>/dev/null || true
        [[ -n "${LHR_CHILD_PID:-}" ]] && kill "$LHR_CHILD_PID" 2>/dev/null || true
    fi

    sleep 5
done
