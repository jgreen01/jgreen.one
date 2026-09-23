// check-secrets: ignore-file — every credential below is a synthetic
// fixture for the scanner itself. Real values must never be added here.
import { describe, it, expect } from "vitest";
import { scanText, shouldScan, DETECTORS } from "../../scripts/lib/secrets.mjs";

const find = (text: string) => scanText(text, "f.md");
const ids = (text: string) => find(text).map((f) => f.id);

// "Credential-shaped", NOT real. Every value below is either generated for
// this suite or a published documentation example (GitHub's docs token, the
// jwt.io sample, AWS's 123456789012). None authenticates against anything.
describe("scanText — credential-shaped values", () => {
  it.each([
    ["aws-access-key-id", 'key = "AKIA2E0A8F3B5C7D9E1F"'],
    ["aws-access-key-id", 'key = "ASIAY34FZKBOKMUTVV7A"'],
    ["github-token", "ghp_16C7e42F292c6912E7710c838347Ae178B4a"],
    ["github-fine-grained-token", "github_pat_11ABCDEFG0aBcDeFgHiJkL_" + "M".repeat(60)],
    ["anthropic-key", "sk-ant-api03-" + "a".repeat(40)],
    ["openai-key", "sk-" + "a".repeat(40)],
    ["stripe-live-key", "sk_live_" + "a".repeat(24)],
    ["slack-token", "xoxb-EXAMPLE-NOT-A-REAL-TOKEN-000"],
    ["google-api-key", "AIza" + "a".repeat(35)],
    ["npm-token", "npm_" + "a".repeat(36)],
    ["private-key-block", "-----BEGIN RSA PRIVATE KEY-----"],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef"],
    ["url-credentials", "https://admin:hunter2@example.com/x"],
  ])("detects %s", (id, text) => {
    expect(ids(text)).toContain(id);
  });

  it("detects a long opaque value assigned to a secret-shaped name", () => {
    expect(ids('api_key: "9f8e7d6c5b4a39281706f5e4d3c2b1a0"')).toContain("assigned-secret");
    expect(ids("AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY9c2b1a0f")).toContain(
      "assigned-secret",
    );
  });

  it("reports the line number", () => {
    const findings = find('ok\nok\nkey = "AKIA2E0A8F3B5C7D9E1F"\n');
    expect(findings[0].line).toBe(3);
  });

  // A scanner that prints the secret it found has leaked it into CI logs and
  // terminal scrollback. The whole point is to report WITHOUT disclosing.
  it("never echoes the matched value in full", () => {
    const secret = "AKIA2E0A8F3B5C7D9E1F";
    const findings = find(`key = "${secret}"`);
    expect(findings).toHaveLength(1);
    expect(JSON.stringify(findings)).not.toContain(secret);
    expect(findings[0].preview).toMatch(/\*/);
  });
});

describe("scanText — what must NOT be flagged", () => {
  // The old guides validator failed on the WORD. These task docs are largely
  // *about* handling secrets, so keyword matching makes the tool useless here.
  it.each([
    "Never commit a secret or a password to the repository.",
    "Use environment variables or a {PLACEHOLDER} for secrets.",
    "Never echo the SECRET env var, and never expand it with ${VAR:-...}.",
    "Redact any secret in notes: sk_live_****last4",
    "- [ ] Rotate the api key if it leaks",
  ])("ignores prose about secrets: %s", (text) => {
    expect(find(text)).toEqual([]);
  });

  it.each([
    'api_key: "{PLACEHOLDER}"',
    'token = "<your-token-here>"',
    'password: "YOUR_PASSWORD_HERE"',
    'secret = "xxxxxxxxxxxxxxxxxxxx"',
    'api_key: "changeme-changeme-changeme"',
    'token: "REDACTED"',
    'key = "example-value-not-a-real-one"',
  ])("ignores the placeholder %s", (text) => {
    expect(find(text)).toEqual([]);
  });

  // Deliberate, and the safer way round: a structural credential pattern fires
  // even when it carries a placeholder word. AWS's own documentation key is the
  // case in point — reviewing one false positive is cheaper than missing a live
  // key that happens to contain "example".
  it("still flags AWS's own example key, placeholder word notwithstanding", () => {
    expect(ids('key = "AKIAIOSFODNN7EXAMPLE"')).toContain("aws-access-key-id");
  });

  it("ignores a git commit SHA", () => {
    expect(find("HEAD is at d1dd0ca14395644915d9ab05a7da95abec7ca0f9")).toEqual([]);
  });

  it("ignores a markdown link whose URL contains a colon", () => {
    expect(find("See [docs](https://docs.aws.amazon.com/x/y.html) for detail.")).toEqual([]);
  });
});

describe("scanText — infrastructure identifiers", () => {
  // Blocked, not merely reported. The rule is to look IDs up fresh from
  // Terraform state or the AWS API every time rather than hardcode them: a copy
  // in a file goes stale the moment the resource is recreated. Synthetic values
  // here, never the real ones — the fixture only needs the shape.
  it.each([
    ["cloudfront-distribution-id", "distribution E0EXAMPLE12345"],
    ["route53-zone-id", "zone Z0EXAMPLE12345"],
  ])("blocks %s as an error", (id, text) => {
    const findings = find(text);
    expect(findings.map((f) => f.id)).toContain(id);
    expect(findings.find((f) => f.id === id)!.severity).toBe("error");
  });

  it("recognises a long modern hosted zone ID", () => {
    expect(ids("zone Z0123456789EXAMPLE12")).toContain("route53-zone-id");
  });

  // Now that these block a commit, a false positive stops work outright. Real
  // IDs mix letters and digits; an all-caps word of the same length has none.
  it.each(["EXTRAORDINARY", "ENVIRONMENTAL", "ZOOMORPHICALLY"])(
    "does not block the ordinary word %s",
    (word) => {
      expect(find(`This is ${word} prose.`)).toEqual([]);
    },
  );

  it("marks real secrets as errors", () => {
    expect(find('k = "AKIA2E0A8F3B5C7D9E1F"')[0].severity).toBe("error");
  });

  it("carries the kind onto each finding", () => {
    expect(find("zone Z0EXAMPLE12345")[0].kind).toBe("identifier");
    expect(find('k = "AKIA2E0A8F3B5C7D9E1F"')[0].kind).toBe("credential");
  });
});

describe("scanText — AWS account IDs", () => {
  // AWS states an account ID is "not considered secret, sensitive, or
  // confidential", but it is an identifier worth not publishing, and the repo
  // is public. Treated as an error so the check is enforceable rather than
  // advisory — a warning nobody acts on is not a control.
  it("flags an account ID in account context as an error", () => {
    const f = find("AWS account 123456789012");
    expect(f.map((x) => x.id)).toContain("aws-account-id");
    expect(f.find((x) => x.id === "aws-account-id")!.severity).toBe("error");
  });

  it("flags an account ID embedded in an ARN", () => {
    expect(ids("arn:aws:iam::123456789012:user/jon")).toContain("aws-account-id");
    expect(ids("arn:aws:wafv2:us-east-1:123456789012:global/webacl/x/y")).toContain(
      "aws-account-id",
    );
  });

  it("redacts the account ID rather than reprinting it", () => {
    const f = find("arn:aws:iam::123456789012:user/jon");
    expect(JSON.stringify(f)).not.toContain("123456789012");
  });

  // Twelve digits is far too common a shape to flag unconditionally — a byte
  // count, a timestamp in ms, a phone number would all trip it.
  it("does not flag a bare 12-digit number with no account context", () => {
    expect(ids("The build produced 123456789012 bytes")).not.toContain("aws-account-id");
  });

  it("does not flag the zero-padded ARN account field used in docs", () => {
    expect(ids("arn:aws:iam::123456789012:role/Example")).toContain("aws-account-id");
  });
});

describe("scanText — one finding per value", () => {
  // A GitHub token assigned to a name called "token" matches both the specific
  // detector and the generic one. Reporting it twice inflates the count and
  // makes the output read as more leaks than there are.
  it("reports a value once, under its most specific detector", () => {
    const findings = find("token: ghp_16C7e42F292c6912E7710c838347Ae178B4a");
    expect(findings).toHaveLength(1);
    expect(findings[0].id).toBe("github-token");
  });

  it("still reports two genuinely different secrets on one line", () => {
    const findings = find('a = "AKIA2E0A8F3B5C7D9E1F" b = "ghp_' + "a".repeat(36) + '"');
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("DETECTORS", () => {
  it("every detector has an id, severity and description", () => {
    expect(DETECTORS.length).toBeGreaterThan(10);
    for (const d of DETECTORS) {
      expect(d.id).toMatch(/^[a-z0-9-]+$/);
      expect(["error", "info"]).toContain(d.severity);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });

  // A credential and an identifier call for different fixes: one has to be
  // rotated, the other only has to be looked up instead of written down. The
  // CLI's advice depends on telling them apart, so every detector says which.
  it("every detector says whether it finds a credential or an identifier", () => {
    for (const d of DETECTORS) expect(["credential", "identifier"]).toContain(d.kind);
  });

  it("classes exactly the provider-assigned IDs as identifiers", () => {
    const identifiers = DETECTORS.filter((d) => d.kind === "identifier")
      .map((d) => d.id)
      .sort();
    expect(identifiers).toEqual(["aws-account-id", "cloudfront-distribution-id", "route53-zone-id"]);
  });

  it("has unique ids", () => {
    expect(new Set(DETECTORS.map((d) => d.id)).size).toBe(DETECTORS.length);
  });
});

describe("shouldScan", () => {
  // Source files are where credentials actually get pasted. An allowlist of
  // prose extensions silently skipped 127 of them, so the rule is inverted:
  // scan everything unless it is known to be binary. A new file type is then
  // covered by default, which is the safe direction for a security check.
  it.each([
    "src/utils/tags.ts",
    "src/components/EntryCard.astro",
    "infra/live/waf.tf",
    "tests/infra/conftest.py",
    "scripts/deploy.sh",
    "scripts/lib/secrets.mjs",
    "package.json",
    "todo/A.md",
    "public/robots.txt",
    ".env.example",
    "Dockerfile",
    "public/icon.svg",
  ])("scans %s", (path) => {
    expect(shouldScan(path)).toBe(true);
  });

  it.each([
    "public/media/hero.webp",
    "public/media/photo.jpg",
    "public/favicon.ico",
    "public/media/talk.pdf",
    "public/fonts/x.woff2",
    "tests/__pycache__/conftest.cpython-311.pyc",
    "archive.tar.gz",
    "video.mp4",
  ])("skips the binary %s", (path) => {
    expect(shouldScan(path)).toBe(false);
  });

  it("is case-insensitive about extensions", () => {
    expect(shouldScan("IMAGE.WEBP")).toBe(false);
    expect(shouldScan("README.MD")).toBe(true);
  });

  it("skips anything inside a vendored or build directory", () => {
    expect(shouldScan("node_modules/x/index.js")).toBe(false);
    expect(shouldScan("dist/entries/index.html")).toBe(false);
    expect(shouldScan(".git/COMMIT_EDITMSG")).toBe(false);
  });
});

describe("scanText — code is not a credential", () => {
  // The generic detector matched any variable with a secret-ish name assigned
  // anything long. In source code that is endemic: `const token = ...` is
  // ordinary. Credentials do not contain brackets, parentheses or $.
  it.each([
    'const token = rest.replace(/#.*$/, "").trim();',
    "const tokens = [...agentsNamedIn(robotsTxt)];",
    "const tokens = roster(dataset).map((c) => c.token.toLowerCase());",
    "const secret = compute({ a: 1, b: 2 });",
    "password: `${prefix}-suffix-value-here`,",
    // Self-referential: "check-secrets:" ends in "secrets" followed by a colon,
    // so the regex body after it read as an assigned value.
    "const IGNORE_FILE = /check-secrets:\\s*ignore-file\\b/i;",
    "const RE = /my-token:\\s*[a-z]+\\*required/i;",
  ])("ignores the code expression %s", (line) => {
    expect(ids(line)).not.toContain("assigned-secret");
  });

  // Still catches the real shapes.
  it.each([
    'api_key: "9f8e7d6c5b4a39281706f5e4d3c2b1a0"',
    "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY9c2b1a0f",
    "export CLIENT_SECRET=aVeryLongOpaqueValue123456",
  ])("still flags %s", (line) => {
    expect(ids(line)).toContain("assigned-secret");
  });
});

describe("scanText — suppression", () => {
  // A scanner with no escape hatch gets disabled wholesale. Suppression is
  // per line and must be written down, so it stays auditable in review.
  it("honours an inline ignore on the same line", () => {
    expect(find('k = "AKIA2E0A8F3B5C7D9E1F" // check-secrets: ignore')).toEqual([]);
  });

  it("honours an ignore on the preceding line", () => {
    expect(find('// check-secrets: ignore\nk = "AKIA2E0A8F3B5C7D9E1F"')).toEqual([]);
  });

  it("does not let one ignore suppress the rest of the file", () => {
    const text =
      '// check-secrets: ignore\nk = "AKIA2E0A8F3B5C7D9E1F"\nj = "AKIA3F1B9C7D5E2A0B7C"';
    expect(find(text)).toHaveLength(1);
    expect(find(text)[0].line).toBe(3);
  });

  it("honours a file-level ignore", () => {
    expect(find('// check-secrets: ignore-file\nk = "AKIA2E0A8F3B5C7D9E1F"')).toEqual([]);
  });

  it("only accepts a file-level ignore near the top of the file", () => {
    const text = 'x\n'.repeat(40) + '// check-secrets: ignore-file\nk = "AKIA2E0A8F3B5C7D9E1F"';
    expect(find(text).length).toBeGreaterThan(0);
  });
});
