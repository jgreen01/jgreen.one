/**
 * Secret detection for prose files.
 *
 * The older `validate_guides.mjs` greps for the WORDS "secret", "password" and
 * "apikey". That is the wrong shape of test for this repository: the task docs
 * and guides are largely *about* handling secrets, so the word appears
 * constantly and legitimately, while a real `AKIA…` key contains none of those
 * words and sails straight through. This matches secret-shaped VALUES instead.
 *
 * Two severities:
 *   error — a credential, or an infrastructure identifier. Fails the run.
 *   info  — reported for awareness; never fails the run unless --strict is
 *           passed. No detector currently uses it: infrastructure identifiers
 *           were informational until 2026-09-22 and now block, because the
 *           rule is to look them up fresh rather than hardcode them.
 *
 * Findings never carry the matched value. A scanner that prints what it found
 * has copied the secret into CI logs and terminal scrollback, which is the
 * thing it exists to prevent.
 */

/** Values that are obviously stand-ins rather than live credentials. */
const PLACEHOLDER_WORDS =
  /(example|changeme|change-me|placeholder|redacted|dummy|sample|your[_-]|yourkey|fake|not-a-real|xxxx|\*\*\*|<|>|\{|\})/i;

/**
 * Characters that appear in code but never inside a credential. Without this,
 * `const token = rest.replace(/#.*$/, "")` reads as a secret assignment, which
 * makes the scanner useless on source files.
 */
const CODE_PUNCTUATION = /[()[\]{}`$\\*]/;

/** A value made of one repeated character carries no information. */
function isRepeatedChar(value) {
  return value.length > 3 && new Set(value.toLowerCase()).size === 1;
}

export function looksLikePlaceholder(value) {
  return PLACEHOLDER_WORDS.test(value) || isRepeatedChar(value);
}

/** Report a match without disclosing it. */
export function redact(value) {
  const text = String(value);
  if (text.length <= 8) return "*".repeat(text.length);
  const stars = "*".repeat(Math.min(12, text.length - 6));
  return `${text.slice(0, 4)}${stars}${text.slice(-2)}`;
}

/**
 * Ordered: more specific patterns first, so an Anthropic key is not reported as
 * a generic OpenAI-style one.
 */
export const DETECTORS = [
  {
    id: "private-key-block",
    severity: "error",
    kind: "credential",
    description: "PEM private key block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    id: "aws-access-key-id",
    severity: "error",
    kind: "credential",
    description: "AWS access key ID",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    id: "github-fine-grained-token",
    severity: "error",
    kind: "credential",
    description: "GitHub fine-grained personal access token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{50,}/g,
  },
  {
    id: "github-token",
    severity: "error",
    kind: "credential",
    description: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: "anthropic-key",
    severity: "error",
    kind: "credential",
    description: "Anthropic API key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: "openai-key",
    severity: "error",
    kind: "credential",
    description: "OpenAI-style API key",
    pattern: /\bsk-(?!ant-)[A-Za-z0-9]{32,}\b/g,
  },
  {
    id: "stripe-live-key",
    severity: "error",
    kind: "credential",
    description: "Stripe live key",
    pattern: /\b[srp]k_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: "slack-token",
    severity: "error",
    kind: "credential",
    description: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    id: "google-api-key",
    severity: "error",
    kind: "credential",
    description: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    id: "npm-token",
    severity: "error",
    kind: "credential",
    description: "npm access token",
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: "jwt",
    severity: "error",
    kind: "credential",
    description: "JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
  },
  {
    id: "url-credentials",
    severity: "error",
    kind: "credential",
    description: "credentials embedded in a URL",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@/gi,
  },
  {
    // The catch-all: a long opaque value assigned to a secret-shaped name.
    // The key name may carry underscores (AWS_SECRET_ACCESS_KEY), so the whole
    // token is matched and then searched, rather than relying on \b.
    id: "assigned-secret",
    severity: "error",
    kind: "credential",
    description: "long value assigned to a secret-shaped name",
    // The only detector that honours placeholders. The structural patterns
    // above deliberately do NOT: a false positive costs one line of review,
    // a false negative is a live credential in the repository. AWS's own
    // documentation key AKIAIOSFODNN7EXAMPLE therefore still trips the  check-secrets: ignore
    // scanner, which is the safer way round.
    placeholderAware: true,
    pattern:
      /[A-Za-z0-9_.-]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_.-]*\s*[:=]\s*["']?([^"'\s,;]{16,})["']?/gi,
    valueGroup: 1,
  },
  {
    // AWS states an account ID is "not considered secret, sensitive, or
    // confidential" — but it is an identifier worth not publishing, and this
    // repository is public. Treated as an error rather than a note so the rule
    // is enforceable: a warning nobody acts on is not a control.
    //
    // Two shapes, both context-scoped. Twelve digits on its own is far too
    // common to flag — a byte count or a millisecond timestamp would trip it.
    id: "aws-account-id",
    severity: "error",
    kind: "identifier",
    description: "AWS account ID",
    // A detector may carry several patterns for one concept.
    pattern: [
      /arn:aws[a-z-]*:[^:\s]*:[^:\s]*:(\d{12}):/gi,
      /\b(?:account|acct)\b[^\n]{0,20}?\b(\d{12})\b/gi,
    ],
    valueGroup: 1,
  },
  // Infrastructure identifiers. Not secrets, and blocked anyway: the rule is to
  // look them up fresh from Terraform state or the AWS API every time rather
  // than hardcode them, because a copy in a file goes stale the moment the
  // resource is recreated. See "Environment & Secrets" in AGENTS.md.
  //
  // Both patterns require at least one digit. Real IDs mix letters and digits;
  // an all-caps word of the same length ("EXTRAORDINARY", "ZOOMORPHICALLY")
  // has none, and once these block a commit a false positive stops work
  // outright. The cost is a real ID that happens to contain no digit slipping
  // through — acceptable for a backstop, since the rule is the control.
  {
    id: "cloudfront-distribution-id",
    severity: "error",
    kind: "identifier",
    description: "CloudFront distribution ID",
    pattern: /\bE(?=[A-Z0-9]*\d)[A-Z0-9]{12,13}\b/g,
  },
  {
    id: "route53-zone-id",
    severity: "error",
    kind: "identifier",
    description: "Route 53 hosted zone ID",
    pattern: /\bZ(?=[A-Z0-9]*\d)[A-Z0-9]{13,}\b/g,
  },
];

/**
 * Scans one file's text. Returns findings in line order, each carrying a
 * redacted preview rather than the matched value.
 */
/**
 * `check-secrets: ignore` on this line or the one above it.
 *
 * The lookahead matters: without it an `ignore-file` marker that is too far
 * down to count as a file-level opt-out would silently suppress the line after
 * it instead, which is a confusing half-effect.
 */
const IGNORE_LINE = /check-secrets:\s*ignore(?!-file)\b/i;
/** `check-secrets: ignore-file`, honoured only near the top of a file. */
const IGNORE_FILE = /check-secrets:\s*ignore-file\b/i;
const IGNORE_FILE_SCAN_LINES = 20;

export function scanText(text, file = "<input>") {
  const findings = [];
  const lines = String(text).split("\n");

  // A whole-file opt-out has to be declared up top where a reviewer sees it,
  // not buried on line 300 under a wall of fixtures.
  if (lines.slice(0, IGNORE_FILE_SCAN_LINES).some((line) => IGNORE_FILE.test(line))) {
    return [];
  }
  // DETECTORS is ordered specific-first, so the first detector to claim a value
  // on a line is the most precise description of it. A GitHub token assigned to
  // a field called "token" is one leak, not two.
  const claimed = new Set();

  lines.forEach((line, index) => {
    // Suppression is per line: an ignore covers the line it is on and the one
    // after it, never the rest of the file.
    if (IGNORE_LINE.test(line)) return;
    if (index > 0 && IGNORE_LINE.test(lines[index - 1])) return;

    for (const detector of DETECTORS) {
      for (const pattern of [].concat(detector.pattern)) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null) {
          // A zero-length match would spin forever; always advance.
          if (pattern.lastIndex === match.index) pattern.lastIndex++;
          const value = detector.valueGroup ? match[detector.valueGroup] : match[0];
          if (!value) continue;
          if (detector.placeholderAware) {
          if (looksLikePlaceholder(value)) continue;
          if (CODE_PUNCTUATION.test(value)) continue;
        }
          const key = `${index}:${value}`;
          if (claimed.has(key)) continue;
          claimed.add(key);
          findings.push({
            id: detector.id,
            severity: detector.severity,
            kind: detector.kind,
            description: detector.description,
            file,
            line: index + 1,
            preview: redact(value),
          });
        }
      }
    }
  });

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Directories that never hold source worth scanning — vendored code, build
 * output, caches.
 */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".astro",
  ".terraform",
  "__pycache__",
  "test-results",
  "playwright-report",
  "coverage",
  ".venv",
  "venv",
]);

/**
 * Extensions whose contents are not text. Everything else is scanned.
 *
 * Deliberately a denylist. An allowlist of prose extensions was silently
 * skipping 127 TypeScript, Astro, Terraform and Python files — which is exactly
 * where a pasted credential ends up. With a denylist, a file type nobody
 * thought about is scanned rather than ignored.
 */
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".ico",
  ".pdf", ".zip", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".webm", ".mov", ".avi", ".wav", ".ogg",
  ".pyc", ".pyo", ".so", ".dylib", ".dll", ".exe", ".bin", ".wasm",
  ".lock", ".tfstate", ".keystore", ".jks",
]);

/** Whether a path should be read and scanned. */
export function shouldScan(filePath) {
  const parts = String(filePath).split(/[/\\]/);
  if (parts.some((part) => SKIP_DIRS.has(part))) return false;
  const name = parts[parts.length - 1] ?? "";
  const dot = name.lastIndexOf(".");
  // A leading dot is part of the name (.env), not an extension.
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return !BINARY_EXTENSIONS.has(ext);
}
