#!/usr/bin/env bash
set -euo pipefail

# Kyronex Studio - gestion minimale de medias video/audio.
# Usage:
#   ./scripts/kyronex_media.sh "https://example.com/video"
#   ./scripts/kyronex_media.sh "https://example.com/video" "nom_sortie"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="${PROJECT_DIR}/media"
URL="${1:-}"
BASENAME="${2:-%(title).120s-%(id)s}"

usage() {
  printf 'Usage: %s <url_video> [nom_sortie]\n' "$0"
  printf 'Exemple: %s "https://www.youtube.com/watch?v=..." "demo_kyronex"\n' "$0"
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Erreur: commande introuvable: %s\n' "$cmd" >&2
    printf 'Installez-la puis relancez le script.\n' >&2
    exit 127
  fi
}

if [[ -z "$URL" || "$URL" == "-h" || "$URL" == "--help" ]]; then
  usage
  exit 1
fi

require_command yt-dlp
require_command ffmpeg
require_command node

mkdir -p "$MEDIA_DIR"

# Les fichiers video sont conserves dans media/ et l'audio MP3 est extrait
# avec ffmpeg via yt-dlp. N'utilisez que des URLs pour lesquelles vous avez
# le droit de telecharger et traiter le contenu.
yt-dlp \
  --no-playlist \
  --restrict-filenames \
  --paths "$MEDIA_DIR" \
  --output "${BASENAME}.%(ext)s" \
  --js-runtimes "node:$(command -v node)" \
  --remote-components ejs:github \
  --continue \
  --retries 50 \
  --fragment-retries 50 \
  --extractor-retries 10 \
  --retry-sleep http:exp=1:60 \
  --retry-sleep fragment:exp=1:60 \
  --format "bv*+ba/b" \
  --merge-output-format mp4 \
  --keep-video \
  --extract-audio \
  --audio-format mp3 \
  --audio-quality 0 \
  "$URL"

printf 'Termine. Fichiers disponibles dans: %s\n' "$MEDIA_DIR"
