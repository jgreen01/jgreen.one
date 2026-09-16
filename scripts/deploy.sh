#!/usr/bin/env bash
set -euo pipefail

# Automatically get outputs from Terraform
echo "Getting outputs from Terraform..."
pushd infra/live > /dev/null
TERRAFORM_OUTPUTS=$(terraform output -json)
popd > /dev/null

DIST_ID=$(echo $TERRAFORM_OUTPUTS | jq -r '.cloudfront_id.value')
BUCKET=$(echo $TERRAFORM_OUTPUTS | jq -r '.site_bucket.value')

if [ -z "$DIST_ID" ] || [ "$DIST_ID" == "null" ]; then
  echo "Error: Could not get CloudFront Distribution ID from Terraform output." >&2
  exit 1
fi

if [ -z "$BUCKET" ] || [ "$BUCKET" == "null" ]; then
  echo "Error: Could not get S3 bucket name from Terraform output." >&2
  exit 1
fi

echo "CloudFront Distribution ID: $DIST_ID"
echo "S3 Bucket: $BUCKET"

# 1) Hydrate managed media before building.
# public/media/ is git-ignored, so a clean checkout has no images. The build
# would then emit none, and the `aws s3 sync --delete` below would remove them
# from the bucket. This step must run first, and must fail loudly if it cannot
# reach S3 — media-check exits non-zero rather than proceeding unverified.
echo "Checking managed media..."
npm ci
node scripts/media-check.mjs --pull

# The viewer-request function runs on every request, and a syntax error in it
# returns 503 for all of them. Neither `create-function` nor `update-function`
# validates the runtime, so publishing is not a safety net — this is. It runs the
# function in CloudFront's real engine on the DEVELOPMENT stage, which no
# distribution serves.
echo "Testing the CloudFront function in the real runtime..."
"$(dirname "${BASH_SOURCE[0]}")/test-cloudfront-function.sh"

# 2) Build Astro
echo "Building Astro site..."
npm run build   # outputs to ./dist

# 3) Audit the build before any of it ships.
# Lighthouse judges the HTML, so the defects it catches -- a canonical naming
# the wrong page, a missing title or description -- are already present in
# dist/. Auditing the live site after a deploy would only confirm that the bad
# version had shipped. This serves dist/ locally and audits that instead, and
# exits non-zero if anything fails, so nothing reaches the bucket.
echo "Auditing the build with Lighthouse..."
node scripts/audit.mjs --preview --base http://127.0.0.1:4322

# 4) Sync static files to S3 (delete removed files)
echo "Syncing files to S3..."
aws s3 sync ./dist "s3://${BUCKET}/" --delete

# 5) Declare the encoding on text formats.
# `aws s3 sync` guesses Content-Type from the extension and never adds a
# charset. Without one a client falls back to a legacy default and reads UTF-8
# bytes as windows-1252, so an em dash arrives as mojibake. HTML escapes this
# because it carries <meta charset>; plain text and Markdown have nowhere else
# to say it, and the Markdown twins exist to be read by machines.
#
# --delete is deliberately absent here: on a filtered pass every excluded file
# looks absent from the source, and the bucket would be emptied.
echo "Declaring UTF-8 on text formats..."
for spec in "txt:text/plain" "vtt:text/vtt"; do
  ext="${spec%%:*}"
  type="${spec#*:}"
  aws s3 cp "s3://${BUCKET}/" "s3://${BUCKET}/" \
    --recursive \
    --exclude "*" --include "*.${ext}" \
    --content-type "${type}; charset=utf-8" \
    --metadata-directive REPLACE
done

# Markdown is stamped one object at a time, because each also carries its own
# token count. An agent can then size a document from a HEAD request instead of
# downloading it to find out. The count cannot come from a response headers
# policy, which sets one fixed value for every response, nor from a function at
# the edge, which cannot see the body.
echo "Stamping Markdown with its charset and token count..."
node "$(dirname "${BASH_SOURCE[0]}")/markdown-tokens.mjs" | while IFS=$'\t' read -r key tokens; do
  [ -n "$key" ] || continue
  aws s3 cp "s3://${BUCKET}/${key}" "s3://${BUCKET}/${key}" \
    --content-type "text/markdown; charset=utf-8" \
    --metadata "markdown-tokens=${tokens}" \
    --metadata-directive REPLACE
done

# 6) Invalidate everything (1,000 paths/month free)
echo "Invalidating CloudFront distribution..."
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*"

echo "Deployment complete."