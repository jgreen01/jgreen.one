/**
 * Build integration tests — SLOW, opt-in.
 *
 * Runs `astro build` against the real content set and asserts the shape of
 * `dist/`. Deliberately excluded from `npm test` (the Vitest inner loop) and run
 * via `npm run test:build`.
 *
 * Unlike the unit tests, this one *does* touch real `dist/` and, for the draft
 * check only, temporarily adds one clearly-named fixture entry to
 * `src/content/entries/` and removes it again in a `finally`. That is the only
 * way to prove drafts produce no route, since the live content set has none.
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIST = join(ROOT, "dist");

const DRAFT_SLUG = "zz-integration-draft-fixture";
const DRAFT_FILE = join(ROOT, "src/content/entries", `${DRAFT_SLUG}.md`);
const DRAFT_TAG = "zz-integration-only-tag";
const DRAFT_CONTENT = `---
title: "Integration Draft Fixture"
description: "Temporary fixture proving drafts are excluded from the build."
pubDate: 2026-01-01
kind: "blog"
tags: ["${DRAFT_TAG}"]
draft: true
---

This entry must never appear in dist/.
`;

function build() {
  return spawnSync("npx", ["astro", "build"], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, NODE_ENV: "production" },
  });
}

function htmlFiles() {
  const found = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) found.push(full);
    }
  })(DIST);
  return found;
}

const exists = (relativePath) => {
  try {
    return statSync(join(DIST, relativePath)).isFile();
  } catch {
    return false;
  }
};

const read = (relativePath) => readFileSync(join(DIST, relativePath), "utf-8");

describe("astro build output", () => {
  let result;

  before(() => {
    rmSync(DRAFT_FILE, { force: true });
    result = build();
  });

  test("the build exits 0", () => {
    assert.equal(result.status, 0, result.stderr?.slice(-2000));
  });

  test("every expected route is emitted", () => {
    for (const route of [
      "index.html",
      "blog/index.html",
      "projects/index.html",
      "entries/index.html",
      "tags/index.html",
      "about/index.html",
      "contact/index.html",
      "404.html",
    ]) {
      assert.ok(exists(route), `missing dist/${route}`);
    }
  });

  test("at least one entry detail page is emitted", () => {
    const detailPages = htmlFiles()
      .map((file) => relative(DIST, file))
      .filter((file) => file.startsWith("entries/") && file !== "entries/index.html");

    assert.ok(detailPages.length > 0, "no entries/<slug>/index.html was built");
  });

  test("at least one tag page is emitted", () => {
    const tagPages = htmlFiles()
      .map((file) => relative(DIST, file))
      .filter((file) => file.startsWith("tags/") && file !== "tags/index.html");

    assert.ok(tagPages.length > 0, "no tags/<tag>/index.html was built");
  });

  test("no page leaks a literal 'undefined' or '[object Object]'", () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const where = relative(DIST, file);
      assert.ok(!html.includes("undefined"), `'undefined' rendered in ${where}`);
      assert.ok(!html.includes("[object Object]"), `'[object Object]' rendered in ${where}`);
    }
  });

  test("every page has a non-empty title, description and canonical link", () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const where = relative(DIST, file);
      assert.match(html, /<title>[^<]+<\/title>/, `empty or missing <title> in ${where}`);
      assert.match(
        html,
        /<meta name="description" content="[^"]+"/,
        `empty or missing description in ${where}`,
      );
      assert.match(
        html,
        /<link rel="canonical" href="https:\/\/[^"]+"/,
        `missing absolute canonical in ${where}`,
      );
    }
  });

  test("every og:image is an absolute URL", () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const match = html.match(/<meta property="og:image" content="([^"]*)"/);
      assert.ok(match, `missing og:image in ${relative(DIST, file)}`);
      assert.match(match[1], /^https:\/\//, `relative og:image in ${relative(DIST, file)}`);
    }
  });

  test("no hero <img> uses a page-relative src", () => {
    // Regression guard: a bare `src="images/x.png"` on /entries/<slug>/ resolves
    // against the page URL and 404s.
    for (const file of htmlFiles()) {
      for (const [, src] of readFileSync(file, "utf-8").matchAll(/<img[^>]+src="([^"]*)"/g)) {
        assert.ok(
          src.startsWith("/") || /^([a-z][a-z0-9+.-]*:)?\/\//i.test(src) || src.startsWith("data:"),
          `page-relative img src "${src}" in ${relative(DIST, file)}`,
        );
      }
    }
  });

  test("every referenced local image exists in dist", () => {
    for (const file of htmlFiles()) {
      for (const [, src] of readFileSync(file, "utf-8").matchAll(/<img[^>]+src="([^"]*)"/g)) {
        if (!src.startsWith("/")) continue;
        const asset = decodeURIComponent(src.split("?")[0]).replace(/^\//, "");
        assert.ok(exists(asset), `dist/${asset} referenced by ${relative(DIST, file)} is missing`);
      }
    }
  });

  test("sitemap-index.xml exists and references at least one sitemap", () => {
    assert.ok(exists("sitemap-index.xml"), "missing dist/sitemap-index.xml");
    const xml = read("sitemap-index.xml");
    assert.match(xml, /<loc>https:\/\/[^<]*sitemap-\d+\.xml<\/loc>/);
  });

  test("the referenced sitemap file is present and lists pages", () => {
    const [, name] = read("sitemap-index.xml").match(/<loc>https:\/\/[^<]*\/([^/<]+\.xml)<\/loc>/);
    assert.ok(exists(name), `missing dist/${name}`);
    assert.match(read(name), /<loc>https:\/\/jgreen\.one\//);
  });
});

describe("draft entries", () => {
  let result;

  before(() => {
    writeFileSync(DRAFT_FILE, DRAFT_CONTENT, "utf-8");
    result = build();
  });

  after(() => {
    rmSync(DRAFT_FILE, { force: true });
  });

  test("the build still succeeds with a draft present", () => {
    assert.equal(result.status, 0, result.stderr?.slice(-2000));
  });

  test("a draft entry produces no detail route", () => {
    assert.equal(
      exists(`entries/${DRAFT_SLUG}/index.html`),
      false,
      "draft entry was published to dist/",
    );
  });

  test("a draft entry contributes no tag route", () => {
    assert.equal(
      exists(`tags/${DRAFT_TAG}/index.html`),
      false,
      "draft-only tag produced a tag page",
    );
  });

  test("a draft entry appears in no listing page and no sitemap", () => {
    for (const file of [...htmlFiles(), join(DIST, "sitemap-0.xml")]) {
      const contents = readFileSync(file, "utf-8");
      assert.ok(
        !contents.includes(DRAFT_SLUG),
        `draft slug leaked into ${relative(DIST, file)}`,
      );
    }
  });
});
