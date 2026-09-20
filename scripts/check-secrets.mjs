#!/usr/bin/env node
/**
 * Scans files for secret-shaped VALUES — source code included.
 *
 * Usage:
 *   node scripts/check-secrets.mjs                 # the whole repo
 *   node scripts/check-secrets.mjs todo src        # explicit paths
 *   node scripts/check-secrets.mjs --staged        # what git is about to commit
 *   node scripts/check-secrets.mjs --history       # every blob ever committed
 *   node scripts/check-secrets.mjs --strict        # infrastructure IDs fail too
 *   node scripts/check-secrets.mjs --json          # machine-readable
 *
 * Exits 1 when a credential is found, so it can gate a commit or CI.
 * Detection and file selection live in scripts/lib/secrets.mjs and are
 * unit-tested; this file is only I/O and output.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scanText, shouldScan } from "./lib/secrets.mjs";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const asJson = args.includes("--json");
const staged = args.includes("--staged");
const history = args.includes("--history");
const roots = args.filter((a) => !a.startsWith("--"));

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (!shouldScan(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * The files git is about to commit, with the content that is actually STAGED.
 *
 * Reading the working copy would be wrong: a secret can be staged and then
 * edited out of the working tree, and the commit would still carry it.
 * `git show :path` reads the index blob, which is what gets committed.
 */
function stagedSources() {
  const listing = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"],
    { encoding: "utf-8" },
  );
  return listing
    .split("\0")
    .filter(Boolean)
    .filter(shouldScan)
    .map((path) => {
      try {
        return { path, text: execFileSync("git", ["show", `:${path}`], { encoding: "utf-8" }) };
      } catch {
        return null; // deleted or unreadable between listing and read
      }
    })
    .filter(Boolean);
}

/**
 * Every version of every file that has ever been committed.
 *
 * A clean working tree says nothing about history: a credential removed in a
 * later commit is still in the repository, still reachable, still cloneable.
 * Paths come from `rev-list --objects` so the same blob is reported under the
 * name it was committed as.
 */
function historySources() {
  const listing = execFileSync("git", ["rev-list", "--objects", "--all"], {
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  });
  // rev-list --objects lists trees as well as blobs, and a tree has a name too.
  // Ask git which objects are actually blobs rather than guessing from the path.
  const types = execFileSync(
    "git",
    ["cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)"],
    { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 },
  );
  const blobs = new Set(
    types
      .split("\n")
      .filter((line) => line.endsWith(" blob"))
      .map((line) => line.slice(0, line.indexOf(" "))),
  );

  const seen = new Map(); // sha -> path (first name wins)
  for (const line of listing.split("\n")) {
    const space = line.indexOf(" ");
    if (space === -1) continue;
    const sha = line.slice(0, space);
    const path = line.slice(space + 1);
    if (path && blobs.has(sha) && !seen.has(sha) && shouldScan(path)) seen.set(sha, path);
  }
  const out = [];
  for (const [sha, path] of seen) {
    try {
      const text = execFileSync("git", ["cat-file", "blob", sha], {
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
      });
      out.push({ path: `${path}@${sha.slice(0, 8)}`, text });
    } catch {
      // not a blob, or unreadable
    }
  }
  return out;
}

let sources;
if (history) {
  sources = historySources();
} else if (staged) {
  sources = stagedSources();
} else {
  const targets = roots.length > 0 ? roots : ["."];
  const files = [];
  for (const target of targets) {
    try {
      if (statSync(target).isDirectory()) walk(target, files);
      else if (shouldScan(target)) files.push(target);
    } catch {
      console.error(`check-secrets: no such path: ${target}`);
      process.exit(2);
    }
  }
  sources = files.map((path) => {
    try {
      return { path, text: readFileSync(path, "utf-8") };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

const findings = sources.flatMap(({ path, text }) => scanText(text, path));
const errors = findings.filter((f) => f.severity === "error");
const infos = findings.filter((f) => f.severity === "info");
const failed = errors.length > 0 || (strict && infos.length > 0);

if (asJson) {
  console.log(JSON.stringify({ scanned: sources.length, staged, findings }, null, 2));
  process.exit(failed ? 1 : 0);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const scope = history ? "historical " : staged ? "staged " : "";

if (errors.length > 0) {
  console.error(`\n✖ ${plural(errors.length, "credential")} in ${scope}files:\n`);
  for (const f of errors) {
    console.error(`  ${f.file}:${f.line}  ${f.id} — ${f.description}`);
    console.error(`    value: ${f.preview}  (redacted)`);
  }
  console.error("\nRemove it, then use an env var, a Terraform data source, or a");
  console.error("<placeholder>. If the value is real, ROTATE IT — and if it has ever");
  console.error("been committed, rotate it regardless: git history keeps it.\n");
}

if (infos.length > 0) {
  const grouped = new Map();
  for (const f of infos) grouped.set(f.id, (grouped.get(f.id) ?? 0) + 1);
  const stream = strict ? console.error : console.log;
  stream(`\n${strict ? "✖" : "•"} ${plural(infos.length, "infrastructure identifier")}:`);
  for (const [id, count] of [...grouped].sort()) stream(`    ${id} ×${count}`);
  stream(
    strict
      ? "\n--strict was passed, so these fail the run.\n"
      : "\nDistribution and zone IDs. Not credentials and not account identifiers,\nwhich are errors — listed for awareness only; they do not fail the run.\n",
  );
}

if (errors.length === 0) {
  console.log(`✓ scanned ${plural(sources.length, `${scope}file`)} — no credentials found.`);
}

process.exit(failed ? 1 : 0);
