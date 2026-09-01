#!/usr/bin/env bash
# Runs infra/live/function.js in CloudFront's real JavaScript engine.
#
# This is the authoritative gate. The Vitest suite runs on Node, which supports
# far more than the cloudfront-js-1.0 runtime, so it cannot catch a syntax error
# that would 503 every request to the site. This can: it runs the source in the
# real engine, in a throwaway function no distribution serves.
#
# Worth knowing: `create-function` and `update-function` do NOT validate the
# runtime. A function using `const` publishes successfully and only fails when a
# request hits it. Publishing is not a safety net; this script is.
#
# Usage: ./scripts/test-cloudfront-function.sh [function-name]
set -euo pipefail

FUNCTION_NAME="${1:-subdirectory-index-rewrite}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ROOT}/infra/live/function.js"

if [ ! -f "$SOURCE" ]; then
  echo "test-cloudfront-function: ${SOURCE} not found" >&2
  exit 1
fi

# A throwaway function, created and deleted per run.
#
# The obvious approach — publishing to the real function's DEVELOPMENT stage —
# has a side effect that breaks deploys: Terraform compares its configuration
# against that stage, so priming it makes `terraform plan` report "No changes"
# while the LIVE stage the distribution actually serves stays stale. The gate
# would then silently block the very change it was validating. Verified, not
# theorised.
PROBE="zz-cf-function-test-$$"

cleanup() {
  etag=$(aws cloudfront describe-function --name "$PROBE" --stage DEVELOPMENT \
    --query 'ETag' --output text 2>/dev/null) || return 0
  aws cloudfront delete-function --name "$PROBE" --if-match "$etag" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Running ${SOURCE} in the CloudFront runtime (throwaway function ${PROBE})..."
aws cloudfront create-function \
  --name "$PROBE" \
  --function-config "{\"Comment\":\"ephemeral test of ${FUNCTION_NAME}\",\"Runtime\":\"cloudfront-js-1.0\"}" \
  --function-code "fileb://${SOURCE}" >/dev/null

ETAG=$(aws cloudfront describe-function --name "$PROBE" --stage DEVELOPMENT \
  --query 'ETag' --output text)

# name | uri | accept | expected uri
CASES=$(cat <<'EOF'
root|/||/index.html
extensionless page|/about||/about/index.html
trailing slash|/blog/||/blog/index.html
static asset untouched|/favicon.svg||/favicon.svg
media asset untouched|/media/hero.png||/media/hero.png
entry as html|/entries/how-this-site-was-made/|text/html,*/*|/entries/how-this-site-was-made/index.html
entry with no accept|/entries/how-this-site-was-made/||/entries/how-this-site-was-made/index.html
entry as markdown|/entries/how-this-site-was-made/|text/markdown, text/html|/entries/how-this-site-was-made/index.md
entry as markdown, no slash|/entries/how-this-site-was-made|text/markdown|/entries/how-this-site-was-made/index.md
markdown uppercase|/entries/x/|TEXT/MARKDOWN|/entries/x/index.md
entries index not negotiated|/entries/|text/markdown|/entries/index.html
homepage not negotiated|/|text/markdown|/index.html
about not negotiated|/about|text/markdown|/about/index.html
asset not negotiated|/media/hero.png|text/markdown|/media/hero.png
EOF
)

failures=0
passed=0

while IFS='|' read -r name uri accept expected; do
  [ -z "$name" ] && continue

  if [ -n "$accept" ]; then
    headers="{\"accept\":{\"value\":\"${accept}\"}}"
  else
    headers="{}"
  fi

  event=$(printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"203.0.113.1"},"request":{"method":"GET","uri":"%s","headers":%s,"cookies":{},"querystring":{}}}' "$uri" "$headers")
  echo "$event" > /tmp/cf-test-event.json

  result=$(aws cloudfront test-function \
    --name "$PROBE" --if-match "$ETAG" --stage DEVELOPMENT \
    --event-object fileb:///tmp/cf-test-event.json \
    --query 'TestResult.{err:FunctionErrorMessage,out:FunctionOutput}' --output json)

  err=$(echo "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["err"] or "")')
  if [ -n "$err" ]; then
    printf '  \033[31m✗\033[0m %-32s RUNTIME ERROR: %s\n' "$name" "$err"
    failures=$((failures + 1))
    continue
  fi

  actual=$(echo "$result" | python3 -c 'import json,sys; print(json.loads(json.load(sys.stdin)["out"])["request"]["uri"])')

  if [ "$actual" = "$expected" ]; then
    printf '  \033[32m✓\033[0m %-32s %s\n' "$name" "$actual"
    passed=$((passed + 1))
  else
    printf '  \033[31m✗\033[0m %-32s expected %s, got %s\n' "$name" "$expected" "$actual"
    failures=$((failures + 1))
  fi
done <<< "$CASES"

rm -f /tmp/cf-test-event.json
echo
if [ "$failures" -gt 0 ]; then
  echo "test-cloudfront-function: ${failures} failed, ${passed} passed" >&2
  exit 1
fi
echo "test-cloudfront-function: ${passed} passed, in the real runtime."
