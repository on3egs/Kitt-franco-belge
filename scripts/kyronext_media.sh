#!/usr/bin/env bash
# Kyronext-Studio - telechargement media en ligne de commande.
#
# Usage :
#   ./scripts/kyronext_media.sh "<URL du media>"
#   ./scripts/kyronext_media.sh "URL" "nom_de_sortie"
#
# Telecharge la video MP4 (meilleure qualite) et en extrait un MP3, dans media/.
# N'utilisez que des contenus pour lesquels vous avez les droits.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="${PROJECT_DIR}/media"
URL="${1:-}"
BASENAME="${2:-%(title).120s-%(id)s}"

usage() {
  printf 'Usage : %s <url> [nom_de_sortie]\n' "$0"
}

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Erreur : commande introuvable : %s\n' "$1" >&2
    exit 127
  fi
}

if [[ -z "$URL" || "$URL" == "-h" || "$URL" == "--help" ]]; then
  usage
  exit 1
fi

require yt-dlp
require ffmpeg
mkdir -p "$MEDIA_DIR"

# node ameliore la compatibilite de yt-dlp mais reste optionnel.
NODE_ARGS=()
if command -v node >/dev/null 2>&1; then
  NODE_ARGS=(--js-runtimes "node:$(command -v node)" --remote-components ejs:github)
fi

yt-dlp \
  --no-playlist \
  --restrict-filenames \
  --paths "$MEDIA_DIR" \
  --output "${BASENAME}.%(ext)s" \
  --continue \
  --retries 50 --fragment-retries 50 --extractor-retries 10 \
  --retry-sleep http:exp=1:30 --retry-sleep fragment:exp=1:30 \
  "${NODE_ARGS[@]}" \
  --format "bv*+ba/b" --merge-output-format mp4 \
  --keep-video --extract-audio --audio-format mp3 --audio-quality 0 \
  "$URL"

printf 'Termine. Fichiers disponibles dans : %s\n' "$MEDIA_DIR"
