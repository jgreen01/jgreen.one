#!/usr/bin/env bash
# Uploads public/media/ to the site bucket and refreshes media-manifest.json.
#
# Each object carries its sha256 as user metadata, so media-check can compare
# hashes without depending on ETag semantics (multipart uploads do not produce
# a plain MD5). Deliberately never passes --delete: removing an asset from the
# bucket is a decision for a human, not a side effect of a push.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA_DIR="${ROOT}/public/media"
PREFIX="media"

if [ ! -d "$MEDIA_DIR" ]; then
  echo "media-push: ${MEDIA_DIR} does not exist — nothing to push." >&2
  exit 1
fi

BUCKET="${SITE_BUCKET:-}"
if [ -z "$BUCKET" ]; then
  echo "Getting bucket name from Terraform..."
  BUCKET=$(cd "${ROOT}/infra/live" && terraform output -raw site_bucket)
fi

if [ -z "$BUCKET" ]; then
  echo "media-push: could not determine the site bucket." >&2
  exit 1
fi

echo "media-push: uploading to s3://${BUCKET}/${PREFIX}/"

pushed=0
while IFS= read -r -d '' file; do
  rel="${file#"${MEDIA_DIR}/"}"
  sha=$(sha256sum "$file" | cut -d' ' -f1)
  content_type=$(file --brief --mime-type "$file")

  aws s3 cp "$file" "s3://${BUCKET}/${PREFIX}/${rel}" \
    --metadata "sha256=${sha}" \
    --content-type "$content_type" \
    --only-show-errors

  echo "  ${rel}  (${content_type}, sha256 ${sha:0:12}…)"
  pushed=$((pushed + 1))
done < <(find "$MEDIA_DIR" -type f -print0)

echo "media-push: uploaded ${pushed} file(s)."

echo "media-push: refreshing the manifest..."
node "${ROOT}/scripts/media-check.mjs" --regen --offline

echo "media-push: done. Commit media-manifest.json alongside your content change."
