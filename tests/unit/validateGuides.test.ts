import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../scripts/validate_guides.mjs");

let workdir: string;

/**
 * `validate_guides.mjs` scans the literal relative path `guides/`, so the test
 * gives it a throwaway working directory containing a synthetic `guides/` tree.
 * The repo's real `guides/` is never read or written.
 */
function runValidator() {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: workdir,
    encoding: "utf-8",
  });
}

function writeGuide(relativePath: string, contents: string) {
  const full = join(workdir, "guides", relativePath);
  mkdirSync(resolve(full, ".."), { recursive: true });
  writeFileSync(full, contents, "utf-8");
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "validate-guides-"));
  mkdirSync(join(workdir, "guides"), { recursive: true });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("validate_guides.mjs", () => {
  it("exits 0 for a directory of clean files", () => {
    writeGuide("how-to-deploy.md", "# Deploy\n\nRun the deploy script.\n");
    writeGuide("reference/cli.md", "# CLI\n\n`npm run build` builds the site.\n");

    const result = runValidator();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("exits 0 for an empty guides directory", () => {
    expect(runValidator().status).toBe(0);
  });

  it.each(["secret", "password", "apikey"])(
    "exits 1 when a file contains '%s'",
    (keyword) => {
      writeGuide("leaky.md", `# Guide\n\nThe ${keyword} is stored in SSM.\n`);

      const result = runValidator();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(keyword);
    },
  );

  it("names the offending file on stderr", () => {
    writeGuide("nested/leaky.md", "password: hunter2\n");

    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("leaky.md");
    expect(result.stderr).toContain("nested");
  });

  it("recurses into subdirectories", () => {
    writeGuide("a/b/c/deep.md", "apikey lives here\n");
    expect(runValidator().status).toBe(1);
  });

  it("reports every offending file, not just the first", () => {
    writeGuide("one.md", "secret\n");
    writeGuide("two.md", "password\n");

    const result = runValidator();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("one.md");
    expect(result.stderr).toContain("two.md");
  });

  describe("documented current behaviour (known false positives)", () => {
    // These assertions pin down what the validator does *today* rather than what
    // an ideal secret scanner would do. If the script is ever made smarter,
    // these tests should be updated deliberately — they are the specification.

    it("is case-insensitive, so 'Password' in prose also fails", () => {
      writeGuide("prose.md", "Never commit your Password to the repo.\n");
      expect(runValidator().status).toBe(1);
    });

    it("matches inside a fenced code block — a keyword in an example still fails", () => {
      writeGuide(
        "example.md",
        "# Example\n\n```bash\nexport DB_PASSWORD={PLACEHOLDER}\n```\n",
      );
      expect(runValidator().status).toBe(1);
    });

    it("matches substrings, so the word 'secrets' in a heading fails", () => {
      writeGuide("heading.md", "## Managing secrets safely\n");
      expect(runValidator().status).toBe(1);
    });

    it("does not flag a real-looking credential that avoids the keywords", () => {
      // The scanner is keyword-based only; it has no entropy or pattern rules.
      writeGuide("token.md", "AKIAIOSFODNN7EXAMPLE\n");
      expect(runValidator().status).toBe(0);
    });
  });
});
