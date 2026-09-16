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
entries index negotiates|/entries/|text/markdown|/entries/index.md
homepage negotiates|/|text/markdown|/index.md
about negotiates|/about|text/markdown|/about/index.md
tag page negotiates|/tags/astro/|text/markdown|/tags/astro/index.md
transcript negotiates|/entries/x/transcript/|text/markdown|/entries/x/transcript/index.md
asset not negotiated|/media/hero.png|text/markdown|/media/hero.png
llms.txt not negotiated|/llms.txt|text/markdown|/llms.txt
sitemap not negotiated|/sitemap-index.xml|text/markdown|/sitemap-index.xml
already markdown untouched|/entries/x/index.md|text/markdown|/entries/x/index.md
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

# ---------------------------------------------------------------------------
# Phase 2: the viewer-response function.
#
# Same reasoning as above — it runs on every response, and a syntax error the
# Node suite cannot see would break the site. Tested in its own throwaway
# function, against the viewer-response event shape.
# ---------------------------------------------------------------------------
RESPONSE_SOURCE="${ROOT}/infra/live/response-function.js"

if [ -f "$RESPONSE_SOURCE" ]; then
  RESPONSE_PROBE="zz-cf-response-test-$$"

  cleanup_response() {
    etag=$(aws cloudfront describe-function --name "$RESPONSE_PROBE" --stage DEVELOPMENT \
      --query 'ETag' --output text 2>/dev/null) || return 0
    aws cloudfront delete-function --name "$RESPONSE_PROBE" --if-match "$etag" >/dev/null 2>&1 || true
  }
  trap 'cleanup; cleanup_response' EXIT

  echo
  echo "Running ${RESPONSE_SOURCE} in the CloudFront runtime (throwaway function ${RESPONSE_PROBE})..."
  aws cloudfront create-function \
    --name "$RESPONSE_PROBE" \
    --function-config "{\"Comment\":\"ephemeral test of markdown-twin-headers\",\"Runtime\":\"cloudfront-js-1.0\"}" \
    --function-code "fileb://${RESPONSE_SOURCE}" >/dev/null

  RESPONSE_ETAG=$(aws cloudfront describe-function --name "$RESPONSE_PROBE" --stage DEVELOPMENT \
    --query 'ETag' --output text)

  # name | uri | content-type | expected link header ("-" for none)
  RESPONSE_CASES=$(cat <<'EOF'
homepage advertises its twin|/|text/html|<https://jgreen.one/index.md>; rel="alternate"; type="text/markdown"
about advertises its twin|/about/|text/html|<https://jgreen.one/about/index.md>; rel="alternate"; type="text/markdown"
extensionless advertises its twin|/about|text/html|<https://jgreen.one/about/index.md>; rel="alternate"; type="text/markdown"
tag page advertises its twin|/tags/astro/|text/html|<https://jgreen.one/tags/astro/index.md>; rel="alternate"; type="text/markdown"
asset advertises nothing|/media/hero.png|image/png|-
llms.txt advertises nothing|/llms.txt|text/plain|-
the twin itself advertises nothing|/entries/x/index.md|text/markdown|-
EOF
)

  while IFS='|' read -r name uri ctype expected; do
    [ -z "$name" ] && continue

    event=$(printf '{"version":"1.0","context":{"eventType":"viewer-response"},"viewer":{"ip":"203.0.113.1"},"request":{"method":"GET","uri":"%s","headers":{},"cookies":{},"querystring":{}},"response":{"statusCode":200,"statusDescription":"OK","headers":{"content-type":{"value":"%s"}},"cookies":{}}}' "$uri" "$ctype")
    echo "$event" > /tmp/cf-response-event.json

    result=$(aws cloudfront test-function \
      --name "$RESPONSE_PROBE" --if-match "$RESPONSE_ETAG" --stage DEVELOPMENT \
      --event-object fileb:///tmp/cf-response-event.json \
      --query 'TestResult.{err:FunctionErrorMessage,out:FunctionOutput}' --output json)

    err=$(echo "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["err"] or "")')
    if [ -n "$err" ]; then
      printf '  \033[31m✗\033[0m %-36s RUNTIME ERROR: %s\n' "$name" "$err"
      failures=$((failures + 1))
      continue
    fi

    actual=$(echo "$result" | python3 -c '
import json, sys
out = json.loads(json.load(sys.stdin)["out"])
link = out.get("response", {}).get("headers", {}).get("link")
print(link["value"] if link else "-")
')

    if [ "$actual" = "$expected" ]; then
      printf '  \033[32m✓\033[0m %-36s %s\n' "$name" "${actual:0:46}"
      passed=$((passed + 1))
    else
      printf '  \033[31m✗\033[0m %-36s expected %s, got %s\n' "$name" "$expected" "$actual"
      failures=$((failures + 1))
    fi
  done <<< "$RESPONSE_CASES"

  rm -f /tmp/cf-response-event.json
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "test-cloudfront-function: ${failures} failed, ${passed} passed" >&2
  exit 1
fi
echo "test-cloudfront-function: ${passed} passed, in the real runtime."
