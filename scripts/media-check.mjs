#!/usr/bin/env node
/**
 * Reconciles the three views of the managed media set: the committed manifest,
 * the local `public/media/` folder, and the S3 bucket.
 *
 * Usage:
 *   node scripts/media-check.mjs            # full check, needs AWS credentials
 *   node scripts/media-check.mjs --offline  # manifest vs local only, no AWS
 *   node scripts/media-check.mjs --pull     # also download anything missing locally
 *   node scripts/media-check.mjs --regen    # rewrite media-manifest.json from disk
 *   node scripts/media-check.mjs --strict   # treat warnings as failures
 *
 * Exits non-zero on any error-severity finding (or any warning under --strict).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import {
  ERROR,
  WARN,
  OK,
  buildManifest,
  findMediaReferences,
  isManagedAsset,
  reconcile,
  sha256,
  shouldFail,
} from "./lib/media.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MEDIA_DIR = join(ROOT, "public/media");
const CONTENT_DIR = join(ROOT, "src/content");
// Only real entries count as references. Scanning all of src/content/ would
// also match the `/media/...` in schema.ts's own error message.
const ENTRIES_DIR = join(CONTENT_DIR, "entries");
const MANIFEST_PATH = join(ROOT, "media-manifest.json");
const S3_PREFIX = "media/";

const flags = new Set(process.argv.slice(2));
const offline = flags.has("--offline");
const pull = flags.has("--pull");
const regen = flags.has("--regen");
const strict = flags.has("--strict");

const today = () => new Date().toISOString().slice(0, 10);

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")).assets ?? [];
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Every managed asset under public/media/, with hash and dimensions. */
function readLocalAssets() {
  return walk(MEDIA_DIR)
    .filter((file) => isManagedAsset(file))
    .map((file) => {
      const buffer = readFileSync(file);
      let width = null;
      let height = null;
      try {
        ({ width = null, height = null } = imageSize(buffer));
      } catch {
        // Not a raster image (PDF, video) — dimensions stay null.
      }
      return {
        path: relative(MEDIA_DIR, file).split("\\").join("/"),
        bytes: buffer.length,
        sha256: sha256(buffer),
        width,
        height,
        addedAt: today(),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * `{ assetPath: [referrer, ...] }` — who points at each managed asset.
 *
 * Referrers are entry ids (`entries/some-post`) for content, and repo-relative
 * paths for code. Code counts because the default OG image is referenced from
 * `src/utils/seoMeta.ts`, not from any entry; without this it would look
 * unreferenced and read as a deletion candidate.
 */
function scanContentReferences() {
  const byPath = {};

  const record = (file, referrer) => {
    for (const assetPath of findMediaReferences(readFileSync(file, "utf-8"))) {
      (byPath[assetPath] ??= []).push(referrer);
    }
  };

  for (const file of walk(ENTRIES_DIR).filter((f) => /\.mdx?$/.test(f))) {
    record(file, relative(CONTENT_DIR, file).replace(/\.mdx?$/, ""));
  }

  for (const dir of ["src/utils", "src/components", "src/layouts", "src/pages"]) {
    for (const file of walk(join(ROOT, dir)).filter((f) => /\.(ts|astro)$/.test(f))) {
      record(file, relative(ROOT, file));
    }
  }

  return byPath;
}

function bucketName() {
  if (process.env.SITE_BUCKET) return process.env.SITE_BUCKET;
  const output = execFileSync("terraform", ["output", "-raw", "site_bucket"], {
    cwd: join(ROOT, "infra/live"),
    encoding: "utf-8",
  });
  return output.trim();
}

/** Lists the bucket prefix and reads each object's sha256 metadata. */
function readS3Assets(bucket) {
  const listing = JSON.parse(
    execFileSync(
      "aws",
      ["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", S3_PREFIX],
      { encoding: "utf-8" },
    ) || "{}",
  );

  return (listing.Contents ?? []).map((object) => {
    // list-objects-v2 does not return user metadata, so the hash needs a
    // separate head-object per key. Fine at this scale; revisit past a few
    // hundred assets.
    const head = JSON.parse(
      execFileSync("aws", ["s3api", "head-object", "--bucket", bucket, "--key", object.Key], {
        encoding: "utf-8",
      }),
    );
    return {
      path: object.Key.slice(S3_PREFIX.length),
      sha256: head.Metadata?.sha256 ?? null,
    };
  });
}

function pullAsset(bucket, path) {
  const destination = join(MEDIA_DIR, path);
  mkdirSync(dirname(destination), { recursive: true });
  execFileSync("aws", ["s3", "cp", `s3://${bucket}/${S3_PREFIX}${path}`, destination], {
    stdio: "inherit",
  });
}

function writeManifest(assets) {
  const body = { version: 1, generatedAt: today(), assets };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
}

const ICON = { [ERROR]: "✗", [WARN]: "!", [OK]: "·" };

function main() {
  let manifest = readManifest();
  const local = readLocalAssets();
  const referencesByPath = scanContentReferences();
  const references = Object.keys(referencesByPath);

  if (regen) {
    manifest = buildManifest(local, { previous: manifest, referencesByPath });
    writeManifest(manifest);
    console.log(`media-check: wrote ${relative(ROOT, MANIFEST_PATH)} (${manifest.length} assets)`);
  }

  let bucket = null;
  let s3 = null;
  if (!offline) {
    try {
      bucket = bucketName();
      s3 = readS3Assets(bucket);
    } catch (error) {
      // Hard failure by design: a deploy must never proceed having silently
      // skipped verification against the durable copy.
      console.error("media-check: could not reach S3 —", error.message.split("\n")[0]);
      console.error("media-check: run with --offline to skip the S3 comparison.");
      process.exit(2);
    }
  }

  let findings = reconcile({ manifest, local, s3, references });

  if (pull && bucket) {
    const pullable = findings.filter((f) => f.action === "pull");
    for (const f of pullable) {
      console.log(`media-check: pulling ${f.path}`);
      pullAsset(bucket, f.path);
    }
    if (pullable.length > 0) {
      findings = reconcile({ manifest, local: readLocalAssets(), s3, references });
    }
  }

  for (const f of findings) {
    const line = `${ICON[f.severity]} ${f.severity.padEnd(5)} ${f.path} — ${f.message}`;
    (f.severity === ERROR ? console.error : console.log)(line);
  }

  if (findings.length === 0) {
    console.log(
      `media-check: ${manifest.length} asset(s) consistent${offline ? " (offline)" : ""}`,
    );
  }

  if (shouldFail(findings, { strict })) process.exit(1);
}

main();
