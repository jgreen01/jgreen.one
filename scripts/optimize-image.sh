#!/usr/bin/env bash
# Compresses an image and drops it into public/media/ ready for `npm run media:push`.
#
# Generated hero images arrive enormous — the one for the Markdown article was
# 1.3 MB of flat vector art that WebP took to 70 KB with no visible loss. On a
# site where the largest asset should be an image, not a *badly encoded* image,
# that difference is worth one command.
#
# Usage:
#   ./scripts/optimize-image.sh <input> [name] [--force]
#
#   input   any image ImageMagick can read
#   name    output basename, no extension (default: the input's, slugified)
#   --force overwrite an existing file in public/media/
#
# Examples:
#   ./scripts/optimize-image.sh ~/Downloads/hero.png serving-markdown-to-ai-agents
#   ./scripts/optimize-image.sh diagram.png            # -> public/media/diagram.webp
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="${ROOT}/public/media"

# Budget for a hero image. Above this the script warns rather than fails —
# a photograph legitimately needs more room than line art.
BUDGET_KB=200

die() { echo "optimize-image: $*" >&2; exit 1; }

[ $# -ge 1 ] || die "usage: optimize-image.sh <input> [name] [--force]"

INPUT="$1"; shift
FORCE=0
NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    *)       NAME="$1" ;;
  esac
  shift
done

[ -f "$INPUT" ] || die "no such file: ${INPUT}"
command -v convert >/dev/null || die "ImageMagick not found (apt install imagemagick)"

# Slugify the input name when none was given: lowercase, non-alphanumerics to
# hyphens, collapsed. Generated filenames like "ChatGPT Image Aug 31, 2026,
# 08_36_36 PM.png" are otherwise a nuisance in a URL.
if [ -z "$NAME" ]; then
  NAME=$(basename "$INPUT")
  NAME="${NAME%.*}"
  NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
fi

OUTPUT="${MEDIA_DIR}/${NAME}.webp"

if [ -e "$OUTPUT" ] && [ "$FORCE" -ne 1 ]; then
  die "${OUTPUT#"${ROOT}/"} already exists (pass --force to overwrite)"
fi

mkdir -p "$MEDIA_DIR"

before=$(stat -c%s "$INPUT")
dims=$(identify -format '%wx%h' "$INPUT[0]" 2>/dev/null || echo 'unknown')

# -strip drops EXIF, which can carry a surprising amount of metadata and, on
# generated images, sometimes the prompt itself.
convert "$INPUT" -strip -quality 82 "$OUTPUT"

after=$(stat -c%s "$OUTPUT")
saved=$(( 100 - (after * 100 / before) ))

printf '  %-10s %s  %s\n' "input"  "$(numfmt --to=iec --format='%6.1f' "$before")" "$dims"
printf '  %-10s %s  %s\n' "output" "$(numfmt --to=iec --format='%6.1f' "$after")" "${OUTPUT#"${ROOT}/"}"
printf '  %-10s %s%%\n'   "saved"  "$saved"
echo

if [ "$after" -gt $((BUDGET_KB * 1024)) ]; then
  echo "  ! larger than ${BUDGET_KB}KB — fine for a photograph, worth a second look for line art." >&2
fi

cat <<EOF
Next:
  npm run media:push                       # upload and update media-manifest.json
  heroImage: "/media/${NAME}.webp"         # in the entry's frontmatter
EOF
