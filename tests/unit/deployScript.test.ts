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
function setupWorkdir(tfOutput: string = DEFAULT_TF_OUTPUT) {
  mkdirSync(join(workdir, "infra", "live"), { recursive: true });
  mkdirSync(join(workdir, "scripts"), { recursive: true });
  mkdirSync(join(workdir, "bin"), { recursive: true });
  mkdirSync(join(workdir, "dist"), { recursive: true });
  writeFileSync(join(workdir, "dist", "index.html"), "<!doctype html>", "utf-8");

  copyFileSync(REAL_SCRIPT, join(workdir, "scripts", "deploy.sh"));

  const log = join(workdir, "invocations.log");
  const record = `printf '%s\\t%s\\t%s\\n' "$(basename "$0")" "$PWD" "$*" >> "${log}"`;

  writeMock("terraform", `${record}\nif [ "$1" = "output" ]; then cat <<'EOF'\n${tfOutput}\nEOF\nfi`);
  writeMock("aws", record);
  writeMock("npm", record);
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
      return { command, cwd, args: args ? args.split(" ") : [] };
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
