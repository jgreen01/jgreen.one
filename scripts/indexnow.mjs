#!/usr/bin/env node
/**
 * Tells IndexNow which URLs a deploy changed.
 *
 * Usage:
 *   node scripts/indexnow.mjs snapshot --out <file>     # before the sync: record the live sitemap
 *   node scripts/indexnow.mjs submit --before <file>    # after it: submit what changed
 *   node scripts/indexnow.mjs submit --all              # every URL in the build (first run only)
 *   node scripts/indexnow.mjs submit ... --dry-run      # print what would be sent; send nothing
 *   ... --dist <dir>                                    # the built site (default: dist)
 *
 * Reads the build in dist/: its sitemap for the URLs and the origin, and
 * dist/indexnow-key.txt, the copy that actually ships, for the key.
 *
 * Exit codes: 0 when it did its job, or when the other end failed (network,
 * HTTP, an unreachable live sitemap); those print a warning instead, because
 * the deploy has already shipped. 1 for a local problem, such as no build or a
 * bad key file. 2 for a usage error. deploy.sh never lets this fail a deploy.
 *
 * Logic lives in scripts/lib/indexnow.mjs and is unit-tested; this file is
 * only I/O.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENDPOINT,
  sitemapLocs,
  collectSitemap,
  changedUrls,
  validateKey,
  submit,
  snapshot,
  toSnapshotJson,
  fromSnapshotJson,
} from "./lib/indexnow.mjs";

const KEY_FILE = "indexnow-key.txt";

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dist = option("--dist") ?? "dist";

const warn = (message) => console.error(`IndexNow: warning: ${message}`);
const fail = (message) => {
  console.error(`IndexNow: ${message}`);
  process.exit(1);
};
const usage = () => {
  console.error("usage: indexnow.mjs snapshot --out <file> | submit (--before <file> | --all) [--dry-run] [--dist <dir>]");
  process.exit(2);
};

/** The built sitemap, and the origin its URLs live on. */
async function builtSitemap() {
  let index;
  try {
    index = readFileSync(join(dist, "sitemap-index.xml"), "utf-8");
  } catch {
    fail(`no ${dist}/sitemap-index.xml; build the site first`);
  }
  const [first] = sitemapLocs(index);
  if (!first) fail(`${dist}/sitemap-index.xml names no sitemaps`);
  const origin = new URL(first).origin;
  const urls = await collectSitemap(index, async (loc) => readFileSync(join(dist, new URL(loc).pathname), "utf-8"));
  return { origin, urls };
}

async function runSnapshot() {
  const out = option("--out");
  if (!out) usage();
  const { origin } = await builtSitemap();
  const result = await snapshot({ origin, fetch });
  if (!result.ok) {
    warn(`could not read the live sitemap (${result.reason}); nothing will be submitted this deploy`);
    return;
  }
  writeFileSync(out, toSnapshotJson(result.urls, { origin, takenAt: new Date().toISOString() }));
  console.log(`IndexNow: recorded ${result.urls.size} live URLs from ${origin}`);
}

async function runSubmit() {
  const all = flag("--all");
  const beforePath = option("--before");
  if (!all && !beforePath) usage();

  const { origin, urls: after } = await builtSitemap();

  let urls;
  if (all) {
    urls = [...after.keys()];
  } else {
    let text = "";
    try {
      text = readFileSync(beforePath, "utf-8");
    } catch {
      // Missing is the same as unusable: handled just below.
    }
    const before = fromSnapshotJson(text);
    if (!before) {
      warn("no usable snapshot of the live sitemap; skipping rather than submitting everything");
      return;
    }
    urls = changedUrls(before, after);
  }

  if (urls.length === 0) {
    console.log("IndexNow: nothing changed; nothing to submit");
    return;
  }

  let key;
  try {
    key = readFileSync(join(dist, KEY_FILE), "utf-8").trim();
  } catch {
    fail(`no ${dist}/${KEY_FILE}; the key file must ship with the site`);
  }
  if (!validateKey(key)) fail(`${dist}/${KEY_FILE} does not hold a valid key`);

  const host = new URL(origin).host;
  const keyLocation = `${origin}/${KEY_FILE}`;

  if (flag("--dry-run")) {
    console.log(`IndexNow: dry run; would submit ${urls.length} URL(s) to ${ENDPOINT} for ${host}:`);
    for (const url of urls) console.log(`  ${url}`);
    return;
  }

  const results = await submit({ urls, host, key, keyLocation, fetch });
  for (const r of results) {
    const line = `${r.count} URL(s) → ${r.status ?? "no response"}: ${r.message}`;
    if (r.ok) console.log(`IndexNow: ${line}`);
    else warn(line);
  }
}

if (command === "snapshot") await runSnapshot();
else if (command === "submit") await runSubmit();
else usage();
