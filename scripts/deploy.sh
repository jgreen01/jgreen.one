#!/usr/bin/env bash
set -euo pipefail

# Inputs (export these or adapt)
DIST_ID="${DIST_ID:?Set CloudFront Distribution ID (e.g., from terraform output)}"
BUCKET="${BUCKET:?Set site bucket name (e.g., from terraform output)}"

# 1) Build Astro
npm ci
npm run build   # outputs to ./dist

# 2) Sync static files to S3 (delete removed files)
aws s3 sync ./dist "s3://${BUCKET}/" --delete

# 3) Invalidate everything (1,000 paths/month free)
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*"
