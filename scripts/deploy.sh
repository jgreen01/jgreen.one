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

# 1) Build Astro
echo "Building Astro site..."
npm ci
npm run build   # outputs to ./dist

# 2) Sync static files to S3 (delete removed files)
echo "Syncing files to S3..."
aws s3 sync ./dist "s3://${BUCKET}/" --delete

# 3) Invalidate everything (1,000 paths/month free)
echo "Invalidating CloudFront distribution..."
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*"

echo "Deployment complete."