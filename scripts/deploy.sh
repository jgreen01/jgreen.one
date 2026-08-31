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

# 2) Build Astro
echo "Building Astro site..."
npm run build   # outputs to ./dist

# 3) Sync static files to S3 (delete removed files)
echo "Syncing files to S3..."
aws s3 sync ./dist "s3://${BUCKET}/" --delete

# 4) Invalidate everything (1,000 paths/month free)
echo "Invalidating CloudFront distribution..."
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*"

echo "Deployment complete."