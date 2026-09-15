import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  existsSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REAL_SCRIPT = resolve(__dirname, "../../scripts/deploy.sh");

/** A logged invocation of one of the mocked external commands. */
interface Invocation {
  command: string;
  cwd: string;
  args: string[];
}

let workdir: string;

/**
 * Fake AWS credentials placed in the environment purely so the tests can assert
 * they never leak into a command line. They are not real and reach no service —
 * every external binary is mocked and the script never touches the network.
 */
const FAKE_ENV = {
  AWS_ACCESS_KEY_ID: "AKIAFAKEFAKEFAKEFAKE",
  AWS_SECRET_ACCESS_KEY: "fake-secret-value-must-never-be-echoed",
  AWS_SESSION_TOKEN: "fake-session-token-must-never-be-echoed",
};

const DEFAULT_TF_OUTPUT = JSON.stringify({
  cloudfront_id: { value: "E2G3DB3OD7XU6F" },
  site_bucket: { value: "jgreen-one-site" },
});

function writeMock(name: string, body: string) {
  const file = join(workdir, "bin", name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`, "utf-8");
  chmodSync(file, 0o755);
}

/**
 * Builds a throwaway copy of the repo layout the script needs (`infra/live/`,
 * `dist/`, `scripts/deploy.sh`) plus stub `terraform`, `aws` and `npm` binaries
 * that record how they were called. Nothing real is installed, built or synced.
 */
/**
 * Stubs `scripts/media-check.mjs`, which deploy.sh invokes by path rather than
 * through PATH. Logs its arguments the same way the PATH mocks do so call
 * ordering can be asserted, and exits with `exitCode` so the "media check fails,
 * deploy aborts" path is testable.
 */
function writeMediaCheckStub(log: string, exitCode = 0) {
  writeFileSync(
    join(workdir, "scripts", "media-check.mjs"),
    [
      "import { appendFileSync } from 'node:fs';",
      `appendFileSync(${JSON.stringify(log)}, 'media-check\\t' + process.cwd() + '\\t' + process.argv.slice(2).join('\\x1f') + '\\n');`,
      `process.exit(${exitCode});`,
    ].join("\n"),
    "utf-8",
  );
}

/**
 * Stubs `scripts/test-cloudfront-function.sh`, which deploy.sh invokes by path.
 * Logs its invocation so ordering can be asserted, and exits with `exitCode` so
 * the "function test fails, deploy aborts" path is testable.
 */
/**
 * Stubs `scripts/audit.mjs`, which deploy.sh invokes by path. Logs its
 * arguments and exits with `exitCode` so the "audit fails, deploy aborts" path
 * is testable without running Lighthouse or a browser.
 */
function writeAuditStub(log: string, exitCode = 0) {
  writeFileSync(
    join(workdir, "scripts", "audit.mjs"),
    [
      "import { appendFileSync } from 'node:fs';",
      `appendFileSync(${JSON.stringify(log)}, 'audit\\t' + process.cwd() + '\\t' + process.argv.slice(2).join('\\x1f') + '\\n');`,
      `process.exit(${exitCode});`,
    ].join("\n"),
    "utf-8",
  );
}

function writeFunctionTestStub(log: string, exitCode = 0) {
  const file = join(workdir, "scripts", "test-cloudfront-function.sh");
  writeFileSync(
    file,
    `#!/usr/bin/env bash\nprintf '%s\\t%s\\t%s\\n' "cf-function-test" "$PWD" "$(IFS=$'\\x1f'; echo "$*")" >> "${log}"\nexit ${exitCode}\n`,
    "utf-8",
  );
  chmodSync(file, 0o755);
}

function setupWorkdir(
  tfOutput: string = DEFAULT_TF_OUTPUT,
  mediaCheckExit = 0,
  functionTestExit = 0,
  auditExit = 0,
) {
  mkdirSync(join(workdir, "infra", "live"), { recursive: true });
  mkdirSync(join(workdir, "scripts"), { recursive: true });
  mkdirSync(join(workdir, "bin"), { recursive: true });
  mkdirSync(join(workdir, "dist"), { recursive: true });
  writeFileSync(join(workdir, "dist", "index.html"), "<!doctype html>", "utf-8");

  copyFileSync(REAL_SCRIPT, join(workdir, "scripts", "deploy.sh"));

  const log = join(workdir, "invocations.log");
  // Arguments are joined with a unit separator rather than a space: an
  // argument may legitimately contain a space (`--content-type "text/plain;
  // charset=utf-8"`), and `"$*"` would make that indistinguishable from two
  // arguments, so an assertion on it could never be accurate.
  const record = `printf '%s\\t%s\\t%s\\n' "$(basename "$0")" "$PWD" "$(IFS=$'\\x1f'; echo "$*")" >> "${log}"`;

  writeMock("terraform", `${record}\nif [ "$1" = "output" ]; then cat <<'EOF'\n${tfOutput}\nEOF\nfi`);
  writeMock("aws", record);
  writeMock("npm", record);
  writeMediaCheckStub(log, mediaCheckExit);
  writeFunctionTestStub(log, functionTestExit);
  writeAuditStub(log, auditExit);
}

function runDeploy() {
  return spawnSync("bash", ["scripts/deploy.sh"], {
    cwd: workdir,
    encoding: "utf-8",
    env: {
      ...process.env,
      ...FAKE_ENV,
      PATH: `${join(workdir, "bin")}:${process.env.PATH}`,
    },
  });
}

function invocations(): Invocation[] {
  const logFile = join(workdir, "invocations.log");
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [command, cwd, args] = line.split("\t");
      return { command, cwd, args: args ? args.split("\x1f") : [] };
    });
}

const callsTo = (command: string) => invocations().filter((i) => i.command === command);

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "deploy-sh-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("scripts/deploy.sh", () => {
  describe("happy path", () => {
    beforeEach(() => setupWorkdir());

    it("exits 0", () => {
      expect(runDeploy().status).toBe(0);
    });

    it("reads Terraform outputs as JSON from infra/live/", () => {
      runDeploy();
      const [call] = callsTo("terraform");
      expect(call).toBeDefined();
      expect(call.args).toEqual(["output", "-json"]);
      expect(call.cwd.endsWith(join("infra", "live"))).toBe(true);
    });

    it("builds before syncing anything to AWS", () => {
      runDeploy();
      const order = invocations().map((i) => i.command);
      expect(order.indexOf("npm")).toBeLessThan(order.indexOf("aws"));
    });

    it("hydrates managed media before building", () => {
      // public/media/ is git-ignored, so a clean checkout has no images. Build
      // first and dist/ has none — then `aws s3 sync --delete` wipes them from
      // the bucket. Ordering here is the guard against that.
      runDeploy();
      const order = invocations().map((i) => i.command);
      const build = invocations().findIndex(
        (i) => i.command === "npm" && i.args.join(" ") === "run build",
      );
      expect(order.indexOf("media-check")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("media-check")).toBeLessThan(build);
    });

    it("asks media-check to pull, not merely to report", () => {
      runDeploy();
      const call = invocations().find((i) => i.command === "media-check");
      expect(call!.args).toContain("--pull");
    });

    it("runs media-check in full mode, never --offline", () => {
      // Offline would skip the S3 comparison, so a deploy could proceed without
      // verifying the durable copy exists.
      runDeploy();
      const call = invocations().find((i) => i.command === "media-check");
      expect(call!.args).not.toContain("--offline");
    });

    it("runs a clean install and a build", () => {
      runDeploy();
      expect(callsTo("npm").map((i) => i.args.join(" "))).toEqual(["ci", "run build"]);
    });

    it("syncs ./dist to the bucket from the Terraform output, with --delete", () => {
      runDeploy();
      const sync = callsTo("aws").find((i) => i.args[0] === "s3");
      expect(sync).toBeDefined();
      expect(sync!.args).toEqual([
        "s3",
        "sync",
        "./dist",
        "s3://jgreen-one-site/",
        "--delete",
      ]);
    });

    // `aws s3 sync` guesses Content-Type from the file extension and never adds
    // a charset. Without one a client falls back to a legacy default and reads
    // UTF-8 bytes as windows-1252, so an em dash arrives as "a€"". HTML escapes
    // this because it carries <meta charset>; a plain-text or Markdown file has
    // nowhere else to say it.
    describe("text formats are stamped as UTF-8", () => {
      const restamps = () =>
        callsTo("aws").filter(
          (i) => i.args[0] === "s3" && i.args[1] === "cp" && i.args.includes("REPLACE"),
        );

      it.each([
        [".txt", "text/plain; charset=utf-8"],
        [".md", "text/markdown; charset=utf-8"],
        [".vtt", "text/vtt; charset=utf-8"],
      ])("declares the charset for %s", (extension, contentType) => {
        runDeploy();
        const call = restamps().find((i) => i.args.includes(`*${extension}`));
        expect(call, `nothing restamps *${extension}`).toBeDefined();
        const typeIndex = call!.args.indexOf("--content-type");
        expect(typeIndex).toBeGreaterThanOrEqual(0);
        expect(call!.args[typeIndex + 1]).toBe(contentType);
      });

      it("restamps in place inside the deployed bucket", () => {
        runDeploy();
        for (const call of restamps()) {
          expect(call.args).toContain("s3://jgreen-one-site/");
          expect(call.args).toContain("--recursive");
        }
      });

      // --delete on a filtered pass would read every excluded file as absent
      // from the source and remove it from the bucket, taking the site with it.
      it("never passes --delete on a filtered pass", () => {
        runDeploy();
        for (const call of restamps()) {
          expect(call.args).not.toContain("--delete");
        }
      });

      it("restamps after the sync has uploaded the files", () => {
        runDeploy();
        const order = callsTo("aws");
        const sync = order.findIndex((i) => i.args[0] === "s3" && i.args[1] === "sync");
        const firstRestamp = order.findIndex(
          (i) => i.args[0] === "s3" && i.args[1] === "cp" && i.args.includes("REPLACE"),
        );
        expect(sync).toBeGreaterThanOrEqual(0);
        expect(firstRestamp).toBeGreaterThan(sync);
      });

      it("restamps before the cache is invalidated", () => {
        runDeploy();
        const order = callsTo("aws");
        const lastRestamp = order.reduce(
          (last, call, index) =>
            call.args[0] === "s3" && call.args[1] === "cp" && call.args.includes("REPLACE")
              ? index
              : last,
          -1,
        );
        const invalidation = order.findIndex((i) => i.args[0] === "cloudfront");
        expect(lastRestamp).toBeGreaterThanOrEqual(0);
        expect(invalidation).toBeGreaterThan(lastRestamp);
      });
    });

    // Lighthouse judges the built HTML, so the defects it catches -- a
    // canonical naming the wrong page, a missing title or description -- are
    // present in dist/ before anything reaches S3. Auditing the live site
    // after a deploy would only confirm the bad version had already shipped.
    describe("the pre-deploy audit", () => {
      const auditCall = () => invocations().find((i) => i.command === "audit");

      it("audits the build", () => {
        runDeploy();
        expect(auditCall()).toBeDefined();
      });

      it("audits what was just built, not the live site", () => {
        runDeploy();
        const base = auditCall()!.args;
        const index = base.indexOf("--base");
        expect(index).toBeGreaterThanOrEqual(0);
        expect(base[index + 1]).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)/);
      });

      it("runs after the build, since it needs dist/", () => {
        runDeploy();
        const order = invocations();
        const build = order.findIndex(
          (i) => i.command === "npm" && i.args.join(" ") === "run build",
        );
        const audit = order.findIndex((i) => i.command === "audit");
        expect(build).toBeGreaterThanOrEqual(0);
        expect(audit).toBeGreaterThan(build);
      });

      // The whole point of a gate: nothing may reach the bucket until it passes.
      it("runs before anything is uploaded", () => {
        runDeploy();
        const order = invocations();
        const audit = order.findIndex((i) => i.command === "audit");
        const sync = order.findIndex(
          (i) => i.command === "aws" && i.args[0] === "s3" && i.args[1] === "sync",
        );
        expect(sync).toBeGreaterThan(audit);
      });
    });

    it("invalidates the whole distribution using the Terraform output id", () => {
      runDeploy();
      const invalidation = callsTo("aws").find((i) => i.args[0] === "cloudfront");
      expect(invalidation).toBeDefined();
      expect(invalidation!.args).toEqual([
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        "E2G3DB3OD7XU6F",
        "--paths",
        "/*",
      ]);
    });

    it("uses values from Terraform rather than hardcoded ones", () => {
      rmSync(workdir, { recursive: true, force: true });
      workdir = mkdtempSync(join(tmpdir(), "deploy-sh-"));
      setupWorkdir(
        JSON.stringify({
          cloudfront_id: { value: "EDIFFERENT123" },
          site_bucket: { value: "some-other-bucket" },
        }),
      );

      runDeploy();
      const args = callsTo("aws").map((i) => i.args.join(" "));
      expect(args.some((a) => a.includes("s3://some-other-bucket/"))).toBe(true);
      expect(args.some((a) => a.includes("EDIFFERENT123"))).toBe(true);
    });
  });

  describe("missing Terraform outputs", () => {
    it.each([
      ["a null cloudfront_id", { cloudfront_id: { value: null }, site_bucket: { value: "b" } }],
      ["a null site_bucket", { cloudfront_id: { value: "E123" }, site_bucket: { value: null } }],
      ["an empty outputs object", {}],
    ])("exits non-zero and never calls aws given %s", (_label, output) => {
      setupWorkdir(JSON.stringify(output));

      const result = runDeploy();
      expect(result.status).not.toBe(0);
      expect(callsTo("aws")).toHaveLength(0);
    });

    it("fails before running a build", () => {
      setupWorkdir(JSON.stringify({}));
      runDeploy();
      expect(callsTo("npm")).toHaveLength(0);
    });

    it("explains which output was missing", () => {
      setupWorkdir(JSON.stringify({ site_bucket: { value: "b" } }));
      const result = runDeploy();
      expect(result.stderr).toMatch(/CloudFront/i);
    });
  });

  describe("the CloudFront function gate", () => {
    it("tests the function before building", () => {
      // A syntax error in the viewer-request function 503s every request to the
      // site, and publishing does not validate the runtime. This gate is the
      // only thing that catches it, so it has to run before anything ships.
      setupWorkdir();
      runDeploy();

      const order = invocations().map((i) => i.command);
      const build = invocations().findIndex(
        (i) => i.command === "npm" && i.args.join(" ") === "run build",
      );
      expect(order.indexOf("cf-function-test")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("cf-function-test")).toBeLessThan(build);
    });

    it("aborts the deploy when the function test fails", () => {
      setupWorkdir(DEFAULT_TF_OUTPUT, 0, 1);

      expect(runDeploy().status).not.toBe(0);
    });

    it("never syncs to S3 after a failed function test", () => {
      setupWorkdir(DEFAULT_TF_OUTPUT, 0, 1);

      runDeploy();
      expect(callsTo("aws")).toHaveLength(0);
    });
  });

  describe("media check failure", () => {
    it("aborts the deploy when media-check exits non-zero", () => {
      setupWorkdir(DEFAULT_TF_OUTPUT, 1);

      const result = runDeploy();
      expect(result.status).not.toBe(0);
    });

    it("never syncs to S3 after a failed media check", () => {
      // The dangerous case: proceeding would build without images and then
      // delete them from the bucket.
      setupWorkdir(DEFAULT_TF_OUTPUT, 1);

      runDeploy();
      expect(callsTo("aws")).toHaveLength(0);
    });

    it("does not build after a failed media check", () => {
      setupWorkdir(DEFAULT_TF_OUTPUT, 1);

      runDeploy();
      expect(callsTo("npm").map((i) => i.args.join(" "))).not.toContain("run build");
    });
  });

  describe("audit failure", () => {
    beforeEach(() => setupWorkdir(DEFAULT_TF_OUTPUT, 0, 0, 1));

    it("aborts the deploy", () => {
      expect(runDeploy().status).not.toBe(0);
    });

    it("uploads nothing", () => {
      runDeploy();
      const uploads = callsTo("aws").filter((i) => i.args[0] === "s3");
      expect(uploads).toHaveLength(0);
    });

    it("does not invalidate the cache", () => {
      runDeploy();
      expect(callsTo("aws").filter((i) => i.args[0] === "cloudfront")).toHaveLength(0);
    });
  });

  describe("credential safety", () => {
    beforeEach(() => setupWorkdir());

    it("never puts a credential value on any command line", () => {
      runDeploy();
      const allArgs = invocations()
        .map((i) => i.args.join(" "))
        .join("\n");

      for (const value of Object.values(FAKE_ENV)) {
        expect(allArgs).not.toContain(value);
      }
    });

    it("never prints a credential value to stdout or stderr", () => {
      const result = runDeploy();
      const output = `${result.stdout}${result.stderr}`;

      for (const value of Object.values(FAKE_ENV)) {
        expect(output).not.toContain(value);
      }
    });

    it("passes no --profile or inline key flags to aws", () => {
      runDeploy();
      const awsArgs = callsTo("aws")
        .map((i) => i.args.join(" "))
        .join("\n");
      expect(awsArgs).not.toMatch(/--profile|--access-key|aws_secret/i);
    });
  });
});
