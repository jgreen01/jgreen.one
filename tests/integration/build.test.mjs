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
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import robotsParser from "robots-parser";
import { parse as parseHtml } from "node-html-parser";

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

/** Every path listed in the generated sitemap. */
const sitemapPaths = () =>
  [...read("sitemap-0.xml").matchAll(/<loc>https:\/\/jgreen\.one([^<]*)<\/loc>/g)].map(
    (m) => m[1],
  );

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

  // A canonical link that is merely *absolute* can still be wrong. When every
  // page names the same URL, search engines treat the whole site as duplicates
  // of that one page and drop the rest from the index. So assert the canonical
  // points at the page carrying it.
  const pathForPage = (file) => {
    const rel = relative(DIST, file).split(sep).join("/");
    if (rel === "index.html") return "/";
    if (rel === "404.html") return "/404/";
    return `/${rel.replace(/index\.html$/, "")}`;
  };

  // 27 of 36 pages once fell back to the site-wide default description. Thin tag
  // pages that also describe themselves identically read as near-duplicates,
  // which is what keeps them out of an index. The homepage is the one page for
  // which the site description IS the right description.
  test("no two indexable pages share a meta description", () => {
    const seen = new Map();
    for (const path of sitemapPaths()) {
      const file = `${path.replace(/^\//, "").replace(/\/$/, "")}/index.html`.replace(
        /^index\.html$/,
        "index.html",
      );
      const target = path === "/" ? "index.html" : file;
      if (!exists(target)) continue;
      const description = read(target).match(
        /<meta name="description" content="([^"]*)"/,
      )?.[1];
      assert.ok(description, `${target} has no meta description`);
      const other = seen.get(description);
      assert.equal(
        other,
        undefined,
        `${target} and ${other} share a description: ${description.slice(0, 60)}…`,
      );
      seen.set(description, target);
    }
    assert.ok(seen.size > 30, `only ${seen.size} pages checked`);
  });

  test("every page's canonical URL points at that page", () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const where = relative(DIST, file);
      const match = html.match(/<link rel="canonical" href="([^"]*)"/);
      assert.ok(match, `missing canonical in ${where}`);
      assert.equal(
        match[1],
        `https://jgreen.one${pathForPage(file)}`,
        `canonical in ${where} names a different page`,
      );
    }
  });

  test("every og:url matches that page's canonical URL", () => {
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const where = relative(DIST, file);
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/);
      const ogUrl = html.match(/<meta property="og:url" content="([^"]*)"/);
      assert.ok(ogUrl, `missing og:url in ${where}`);
      assert.equal(ogUrl[1], canonical[1], `og:url disagrees with canonical in ${where}`);
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

  test("every referenced local image is either built or a managed asset", () => {
    // public/media/ is git-ignored, so a checkout without AWS credentials (CI
    // today) has no image bytes and cannot satisfy a plain existence check.
    // The manifest is committed, though, so a reference can still be proven to
    // name a *known* asset — which is the bug this catches: a typo or a path
    // pointing at something nobody manages. Once CI can run `media-check
    // --pull` (task 9), tighten this back to requiring the file in dist/.
    const managed = new Set(
      JSON.parse(readFileSync(join(ROOT, "media-manifest.json"), "utf-8")).assets.map(
        (asset) => `media/${asset.path}`,
      ),
    );

    for (const file of htmlFiles()) {
      for (const [, src] of readFileSync(file, "utf-8").matchAll(/<img[^>]+src="([^"]*)"/g)) {
        if (!src.startsWith("/")) continue;
        const asset = decodeURIComponent(src.split("?")[0]).replace(/^\//, "");
        assert.ok(
          exists(asset) || managed.has(asset),
          `${asset} referenced by ${relative(DIST, file)} is neither built nor in media-manifest.json`,
        );
      }
    }
  });

  test("every og:image points at a built file or a managed asset", () => {
    const managed = new Set(
      JSON.parse(readFileSync(join(ROOT, "media-manifest.json"), "utf-8")).assets.map(
        (asset) => `media/${asset.path}`,
      ),
    );

    for (const file of htmlFiles()) {
      const [, url] = readFileSync(file, "utf-8").match(
        /<meta property="og:image" content="([^"]*)"/,
      );
      const asset = decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
      assert.ok(
        exists(asset) || managed.has(asset),
        `og:image ${asset} on ${relative(DIST, file)} is neither built nor managed`,
      );
    }
  });

  test("the media manifest is consistent with the content", () => {
    // Offline mode needs no AWS access, so this runs everywhere. It is what
    // catches an entry referencing an asset nobody manages.
    const result = spawnSync(
      process.execPath,
      ["scripts/media-check.mjs", "--offline", "--strict"],
      { cwd: ROOT, encoding: "utf-8" },
    );
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });

  test("every page links its favicons and manifest", () => {
    // astro-favicons generates these assets but stopped injecting the <head>
    // tags in Astro 7 — silently, with no build warning. src/components/
    // Favicons.astro supplies them instead; this is the guard that the tags are
    // actually present, not just the files.
    for (const file of htmlFiles()) {
      const html = readFileSync(file, "utf-8");
      const where = relative(DIST, file);
      for (const pattern of [
        /<link rel="icon" href="\/favicon\.ico"/,
        /<link rel="icon" href="\/favicon\.svg"/,
        /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/,
        /<link rel="manifest" href="\/manifest\.webmanifest"/,
      ]) {
        assert.match(html, pattern, `missing favicon link in ${where}`);
      }
    }
  });

  test("every asset the favicon links point at was actually generated", () => {
    const html = read("index.html");
    for (const [, href] of html.matchAll(
      /<link rel="(?:icon|apple-touch-icon|mask-icon|manifest)"[^>]*href="([^"]+)"/g,
    )) {
      assert.ok(exists(href.replace(/^\//, "")), `dist${href} is referenced but missing`);
    }
  });

  test("markdown renders GFM without a remark plugin", () => {
    // Astro 7 replaced remark/rehype with its native processor, so remark-gfm
    // was removed. Code fences are the GFM feature the real content uses.
    const article = read("entries/how-this-site-was-made/index.html");
    assert.match(article, /<pre[^>]*class="astro-code/, "code fences lost their highlighting");
  });

  test("every published entry has a Markdown copy", () => {
    const entryPages = htmlFiles()
      .map((file) => relative(DIST, file))
      .filter(
        (file) =>
          file.startsWith("entries/") &&
          file !== "entries/index.html" &&
          // A transcript lives under an entry but is not an entry page: its
          // twin is a sibling `<page>.md`, checked in the next test. Without
          // this the generic rule looks for transcript/index.md and fails.
          !file.endsWith("/transcript/index.html"),
      );

    assert.ok(entryPages.length > 0, "no entry pages to check");
    for (const page of entryPages) {
      assert.ok(exists(page.replace(/index\.html$/, "index.md")), `missing .md for ${page}`);
    }
  });

  test("every published transcript has a Markdown copy", () => {
    // Vacuous while no talk write-up is published; the transcripts suite below
    // proves the same thing against a fixture pair regardless.
    for (const page of htmlFiles()
      .map((file) => relative(DIST, file))
      .filter((file) => file.endsWith("/transcript/index.html"))) {
      assert.ok(exists(page.replace(/\/index\.html$/, ".md")), `missing .md for ${page}`);
    }
  });

  test("the Markdown carries the same body as the source entry", () => {
    // Same content in a lighter format is content negotiation; different
    // content would be cloaking. This is the assertion that keeps them honest.
    const md = read("entries/how-this-site-was-made/index.md");
    const source = readFileSync(
      join(ROOT, "src/content/entries/how-this-site-was-made.md"),
      "utf-8",
    ).replace(/^---[\s\S]*?\n---\n/, "");

    for (const line of source.split("\n").filter((l) => l.trim().length > 40).slice(0, 5)) {
      assert.ok(md.includes(line.trim()), `body line missing from markdown: ${line.slice(0, 50)}`);
    }
  });

  test("the Markdown stands alone", () => {
    const md = read("entries/how-this-site-was-made/index.md");
    assert.match(md, /^# /, "no title heading");
    assert.match(md, /https:\/\/jgreen\.one\/entries\//, "no canonical URL to cite");
    assert.match(md, /Published: \d{4}-\d{2}-\d{2}/, "no publish date");
  });

  test("the Markdown is substantially smaller than the HTML", () => {
    const html = read("entries/how-this-site-was-made/index.html").length;
    const md = read("entries/how-this-site-was-made/index.md").length;
    assert.ok(md < html / 3, `markdown ${md} is not much smaller than html ${html}`);
  });

  test("llms.txt lists every entry, and every link resolves", () => {
    const txt = read("llms.txt");
    for (const [, url] of txt.matchAll(/\]\((https:\/\/[^)]+)\)/g)) {
      const path = new URL(url).pathname.replace(/^\//, "");
      assert.ok(exists(path), `llms.txt links to ${path}, which was not built`);
    }
  });

  test("no draft leaks into the Markdown copies or llms.txt", () => {
    const txt = read("llms.txt");
    assert.ok(!txt.includes(DRAFT_SLUG), "draft listed in llms.txt");
    assert.equal(exists(`entries/${DRAFT_SLUG}/index.md`), false, "draft has a .md copy");
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

  // Without a lastmod a crawler has no signal that a page changed, so a stale
  // copy can sit in the index indefinitely.
  const sitemapUrls = () => {
    const entries = new Map();
    for (const block of read("sitemap-0.xml").matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
      const lastmod = block[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      if (loc) entries.set(new URL(loc).pathname, lastmod);
    }
    return entries;
  };

  test("entry pages carry a lastmod matching their publish date", () => {
    const urls = sitemapUrls();
    const entryPaths = [...urls.keys()].filter((path) => /^\/entries\/[^/]+\/$/.test(path));
    assert.ok(entryPaths.length > 0, "no entry pages in the sitemap");
    for (const path of entryPaths) {
      const lastmod = urls.get(path);
      assert.ok(lastmod, `no lastmod for ${path}`);
      const slug = path.split("/")[2];
      const source = readFileSync(join(ROOT, "src/content/entries", `${slug}.md`), "utf-8");
      const expected = (source.match(/^updatedDate:\s*["']?(\d{4}-\d{2}-\d{2})/m) ??
        source.match(/^pubDate:\s*["']?(\d{4}-\d{2}-\d{2})/m))[1];
      assert.ok(
        lastmod.startsWith(expected),
        `${path} says ${lastmod}, expected ${expected} from its frontmatter`,
      );
    }
  });

  test("listing pages are dated by the newest entry", () => {
    const urls = sitemapUrls();
    const newest = [...urls.entries()]
      .filter(([path]) => /^\/entries\/[^/]+\/$/.test(path))
      .map(([, lastmod]) => lastmod)
      .sort()
      .at(-1);
    for (const path of ["/", "/blog/", "/projects/", "/entries/"]) {
      assert.equal(urls.get(path), newest, `${path} is not dated by the newest entry`);
    }
  });

  // Stamping an undatable page with the build time would be a false signal,
  // and a crawler that learns lastmod is unreliable stops trusting all of them.
  test("pages that cannot be honestly dated carry no lastmod", () => {
    const urls = sitemapUrls();
    for (const path of ["/about/", "/contact/"]) {
      assert.equal(urls.get(path), undefined, `${path} should not claim a lastmod`);
    }
  });
});

// Google forbids marking up an author a reader cannot see, so the byline has
// to be rendered before it can be claimed in structured data. It also just
// tells a reader who wrote the thing.
describe("the article byline", () => {
  let result;

  before(() => {
    result = build();
  });

  const entryPages = () =>
    htmlFiles()
      .map((file) => relative(DIST, file).split(sep).join("/"))
      .filter((path) => /^entries\/[^/]+\/index\.html$/.test(path));

  test("the build succeeded", () => {
    assert.equal(result.status, 0, result.stderr);
  });

  test("every entry page names its author in visible text", () => {
    const pages = entryPages();
    assert.ok(pages.length > 0, "no entry pages were built");
    for (const page of pages) {
      const html = read(page);
      const article = html.slice(html.indexOf("<article"), html.indexOf("</article>"));
      assert.match(article, /Jon Green/, `no byline inside <article> on ${page}`);
    }
  });

  test("the byline sits with the date, above the content", () => {
    for (const page of entryPages()) {
      const html = read(page);
      const byline = html.indexOf("Jon Green", html.indexOf("<article"));
      const published = html.indexOf("Published on");
      assert.ok(byline > -1, `no byline on ${page}`);
      // Same line of metadata: adjacent, not separated by the whole article.
      assert.ok(
        Math.abs(byline - published) < 400,
        `byline and date are not adjacent on ${page}`,
      );
    }
  });

  test("the byline comes from frontmatter, not a hardcoded string", () => {
    // A fixture entry with a different author proves the value is read rather
    // than baked in. Removed again in the finally.
    const slug = "zz-byline-fixture";
    const file = join(ROOT, "src/content/entries", `${slug}.md`);
    writeFileSync(
      file,
      `---\ntitle: "Byline Fixture"\ndescription: "Temporary fixture proving the byline is read from frontmatter."\nauthor: "Ada Lovelace"\npubDate: 2026-01-02\nkind: "blog"\ndraft: false\n---\n\nBody.\n`,
      "utf-8",
    );
    try {
      const rebuilt = build();
      assert.equal(rebuilt.status, 0, rebuilt.stderr);
      const html = read(`entries/${slug}/index.html`);
      assert.match(html, /Ada Lovelace/, "frontmatter author was not rendered");
    } finally {
      rmSync(file, { force: true });
    }
  });
});

// Structured data is invisible on the page, so a mistake in it survives every
// visual check. These assertions are the only thing that looks at it.
describe("structured data", () => {
  let result;

  before(() => {
    result = build();
  });

  const nodeIn = (relativePath) => {
    const html = read(relativePath);
    const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    return { count: matches.length, json: matches[0] ? JSON.parse(matches[0][1]) : null };
  };

  const entryPages = () =>
    htmlFiles()
      .map((file) => relative(DIST, file).split(sep).join("/"))
      .filter((path) => /^entries\/[^/]+\/index\.html$/.test(path));

  /**
   * The node of a given @type, whether the page emits a single node or an
   * @graph. Entry pages now carry both an article and a breadcrumb trail, so
   * reading @type off the top level no longer finds the article.
   */
  const typedNode = (relativePath, ...types) => {
    const { json } = nodeIn(relativePath);
    if (!json) return null;
    const nodes = "@graph" in json ? json["@graph"] : [json];
    return nodes.find((node) => types.includes(node["@type"])) ?? null;
  };
  const articleIn = (relativePath) => typedNode(relativePath, "Article", "BlogPosting");

  test("the build succeeded", () => {
    assert.equal(result.status, 0, result.stderr);
  });

  test("every entry page carries exactly one JSON-LD block that parses", () => {
    const pages = entryPages();
    assert.ok(pages.length > 0, "no entry pages were built");
    for (const page of pages) {
      const { count, json } = nodeIn(page);
      assert.equal(count, 1, `${page} has ${count} JSON-LD blocks`);
      assert.equal(json["@context"], "https://schema.org", `wrong @context in ${page}`);
    }
  });

  // A project is not a blog posting; the type has to follow `kind`.
  test("the @type follows the entry kind", () => {
    for (const page of entryPages()) {
      const slug = page.split("/")[1];
      const source = readFileSync(join(ROOT, "src/content/entries", `${slug}.md`), "utf-8");
      const kind = source.match(/^kind:\s*"?(\w+)"?/m)?.[1] ?? "blog";
      const expected = kind === "project" ? "Article" : "BlogPosting";
      assert.equal(articleIn(page)["@type"], expected, `${page} is typed wrong for kind ${kind}`);
    }
  });

  // Google substitutes Googlebot's timezone when none is given, which is how a
  // publication date silently moves by a day.
  test("datePublished matches the frontmatter and states a timezone", () => {
    for (const page of entryPages()) {
      const slug = page.split("/")[1];
      const source = readFileSync(join(ROOT, "src/content/entries", `${slug}.md`), "utf-8");
      const day = source.match(/^pubDate:\s*"?(\d{4}-\d{2}-\d{2})/m)[1];
      const published = articleIn(page).datePublished;
      assert.ok(published.startsWith(day), `${page}: ${published} does not start with ${day}`);
      assert.match(published, /(Z|[+-]\d{2}:\d{2})$/, `${page}: ${published} has no timezone`);
    }
  });

  test("the author is named, with the role kept out of the name", () => {
    for (const page of entryPages()) {
      const author = articleIn(page).author;
      assert.equal(author["@type"], "Person", `${page} author is not a Person`);
      assert.equal(author.name, "Jon Green", `${page} author name is wrong`);
      assert.ok(author.sameAs.length > 0, `${page} has an empty sameAs`);
      for (const url of author.sameAs) {
        assert.match(url, /^https:\/\//, `${page} sameAs entry is not absolute: ${url}`);
      }
    }
  });

  // The author markup is only permitted because the byline is rendered.
  test("the author it claims is visible on the page", () => {
    for (const page of entryPages()) {
      const html = read(page);
      const article = html.slice(html.indexOf("<article"), html.indexOf("</article>"));
      assert.match(article, new RegExp(articleIn(page).author.name), `author not visible on ${page}`);
    }
  });

  test("no JSON-LD block contains a relative URL or a literal undefined", () => {
    for (const page of [...entryPages(), "index.html", "about/index.html"]) {
      const { json } = nodeIn(page);
      const text = JSON.stringify(json);
      assert.ok(!text.includes("undefined"), `'undefined' in the JSON-LD on ${page}`);
      const relative = text.match(/"(\/[^"]*)"/g) ?? [];
      assert.equal(relative.length, 0, `relative URLs on ${page}: ${relative.join(", ")}`);
    }
  });

  test("the about page is a ProfilePage whose mainEntity is the author", () => {
    const { json } = nodeIn("about/index.html");
    assert.equal(json["@type"], "ProfilePage");
    assert.equal(json.mainEntity["@type"], "Person");
    assert.equal(json.mainEntity["@id"], "https://jgreen.one/about/#person");
  });

  // One identity across pages, rather than two people who share a name.
  test("the author @id is the same on an entry and on the about page", () => {
    const onEntry = articleIn(entryPages()[0]).author["@id"];
    assert.equal(onEntry, nodeIn("about/index.html").json.mainEntity["@id"]);
  });

  test("the homepage is a WebSite with no potentialAction", () => {
    const { json } = nodeIn("index.html");
    assert.equal(json["@type"], "WebSite");
    assert.ok(
      !("potentialAction" in json),
      "the sitelinks search box was deprecated in 2024; potentialAction produces nothing",
    );
  });

  // A listing page may describe itself — it is a CollectionPage — but it must
  // never claim to BE one of the articles it lists. The assertion is on the
  // type, not on the absence of markup, so adding CollectionPage was allowed
  // and adding Article still is not.
  test("listing pages carry no article markup", () => {
    for (const page of ["blog/index.html", "projects/index.html", "entries/index.html"]) {
      const { json } = nodeIn(page);
      if (!json) continue;
      const types = ("@graph" in json ? json["@graph"] : [json]).map((n) => n["@type"]);
      for (const type of types) {
        assert.ok(
          !["Article", "BlogPosting"].includes(type),
          `${page} describes itself as ${type}`,
        );
      }
    }
  });

  test("listing pages describe themselves as a CollectionPage of what they show", () => {
    for (const [page, listing] of [
      ["blog/index.html", "blog"],
      ["projects/index.html", "projects"],
      ["entries/index.html", "entries"],
    ]) {
      const { json } = nodeIn(page);
      assert.ok(json, `${page} carries no JSON-LD`);
      assert.equal(json["@type"], "CollectionPage", `${page} is not a CollectionPage`);
      const items = json.mainEntity.itemListElement;
      assert.ok(Array.isArray(items), `${page} has no ItemList`);

      // The markup must list exactly what the page renders, in order.
      const html = read(page);
      const rendered = [
        ...new Set(
          [...html.matchAll(/href="(\/entries\/[^"/]+)"/g)].map((m) => m[1]),
        ),
      ];
      assert.equal(
        items.length,
        rendered.length,
        `${listing}: ItemList has ${items.length} items but the page renders ${rendered.length} cards`,
      );
      assert.deepEqual(
        items.map((i) => i.position),
        items.map((_, index) => index + 1),
        `${page} positions are not 1-based and contiguous`,
      );
    }
  });

  test("entry pages carry both their article node and a breadcrumb trail", () => {
    for (const page of entryPages()) {
      const { json } = nodeIn(page);
      const nodes = "@graph" in json ? json["@graph"] : [json];
      const types = nodes.map((n) => n["@type"]);
      assert.ok(
        types.includes("Article") || types.includes("BlogPosting"),
        `${page} lost its article node`,
      );
      assert.ok(types.includes("BreadcrumbList"), `${page} has no breadcrumb trail`);
    }
  });

  // Google requires at least two ListItems, and markup may only claim what the
  // reader can see — so a page with a trail in its markup must show one.
  test("every breadcrumb trail has at least two crumbs and is visible on the page", () => {
    for (const page of htmlFiles().map((f) => relative(DIST, f).split(sep).join("/"))) {
      const html = read(page);
      const { json } = nodeIn(page);
      if (!json) continue;
      const nodes = "@graph" in json ? json["@graph"] : [json];
      const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList");
      if (!crumbs) continue;
      assert.ok(
        crumbs.itemListElement.length >= 2,
        `${page} emits a trail of ${crumbs.itemListElement.length}`,
      );
      assert.match(html, /aria-label="Breadcrumb"/, `${page} has trail markup but no visible trail`);
    }
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

/**
 * Transcripts.
 *
 * Uses the same throwaway-fixture approach as the draft check above, and for
 * the same reason: the live content set has no published transcript yet, so
 * asserting against it would pass vacuously and prove nothing.
 *
 * The pair matters. A transcript is only published when its article is, so both
 * halves are exercised — one live entry with a transcript, one draft entry with
 * a transcript that must not reach dist/.
 */
describe("transcripts", () => {
  const LIVE = "zz-integration-transcript-fixture";
  const HIDDEN = "zz-integration-transcript-draft-fixture";

  const entryFile = (slug) => join(ROOT, "src/content/entries", `${slug}.md`);
  const transcriptFile = (slug) => join(ROOT, "src/content/transcripts", `${slug}.md`);

  const entryContent = (slug, draft) => `---
title: "Transcript Fixture ${slug}"
description: "Temporary fixture exercising the transcript routes."
pubDate: 2026-01-02
kind: "blog"
tags: ["${DRAFT_TAG}"]
draft: ${draft}
---

Fixture article for the transcript integration test.
`;

  const transcriptContent = (slug) => `---
title: "Transcript Fixture ${slug}"
description: "Temporary transcript fixture."
entry: "${slug}"
event: "Fixture Event"
recordingUrl: "https://www.youtube.com/watch?v=zzfixture01"
videoId: "zzfixture01"
recordedDate: 2026-01-02
durationSeconds: 2928
mirrorUrl: "/media/zz-fixture-mirror.mp4"
editedNote: "Fixture note."
---

**[[00:00](https://www.youtube.com/watch?v=zzfixture01&t=0s)]** **Jon Green:** Fixture opening line.

**[[01:36](https://www.youtube.com/watch?v=zzfixture01&t=96s)]** **Audience:** Fixture question?
`;

  // The captions route reads the .vtt beside the transcript, so the fixture
  // needs one too — a real caption excerpt, not an invented string.
  const captionsFixture = readFileSync(join(ROOT, "tests/fixtures/talk-excerpt.vtt"), "utf-8");
  const captionsFile = (slug) => join(ROOT, "src/content/transcripts", `${slug}.vtt`);

  const written = [
    [entryFile(LIVE), entryContent(LIVE, false)],
    [transcriptFile(LIVE), transcriptContent(LIVE)],
    [captionsFile(LIVE), captionsFixture],
    [entryFile(HIDDEN), entryContent(HIDDEN, true)],
    [transcriptFile(HIDDEN), transcriptContent(HIDDEN)],
  ];

  let result;

  before(() => {
    for (const [file, content] of written) writeFileSync(file, content);
    result = build();
  });

  after(() => {
    for (const [file] of written) rmSync(file, { force: true });
  });

  test("the build succeeds with transcripts present", () => {
    assert.equal(result.status, 0, result.stderr?.slice(-2000));
  });

  test("a published transcript emits both an HTML page and a .md twin", () => {
    assert.ok(exists(`entries/${LIVE}/transcript/index.html`), "missing transcript page");
    assert.ok(exists(`entries/${LIVE}/transcript.md`), "missing transcript .md twin");
  });

  test("the page links every timestamp into the recording", () => {
    const html = read(`entries/${LIVE}/transcript/index.html`);
    assert.match(html, /youtube\.com\/watch\?v=zzfixture01&(amp;)?t=0s/);
    assert.match(html, /youtube\.com\/watch\?v=zzfixture01&(amp;)?t=96s/);
  });

  test("the page links back to the article it belongs to", () => {
    assert.match(read(`entries/${LIVE}/transcript/index.html`), new RegExp(`/entries/${LIVE}"`));
  });

  test("the .md twin stands alone: title, source URL, edit note, body", () => {
    const md = read(`entries/${LIVE}/transcript.md`);
    assert.match(md, /^# Transcript Fixture .* — transcript$/m);
    assert.ok(md.includes(`/entries/${LIVE}/transcript`), "missing canonical URL");
    assert.ok(md.includes("Fixture note."), "missing edit note");
    assert.ok(md.includes("Fixture opening line."), "missing transcript body");
    assert.ok(md.includes("48 minutes"), "missing runtime");
  });

  // The side door a draft could otherwise walk out of.
  test("a transcript whose article is a draft is not emitted", () => {
    assert.ok(!exists(`entries/${HIDDEN}/transcript/index.html`), "draft transcript page leaked");
    assert.ok(!exists(`entries/${HIDDEN}/transcript.md`), "draft transcript .md leaked");
  });

  test("the mirrored recording is offered with a caption track", () => {
    const html = read(`entries/${LIVE}/transcript/index.html`);
    assert.match(html, /<video[^>]*>/, "no video element for the mirror");
    assert.ok(html.includes("/media/zz-fixture-mirror.mp4"), "mirror src missing");
    assert.match(html, /<track[^>]+kind="captions"/, "no caption track");
    assert.ok(html.includes(`/entries/${LIVE}/captions.vtt`), "track does not point at captions");
  });

  test("the caption track is emitted as real WEBVTT", () => {
    assert.ok(exists(`entries/${LIVE}/captions.vtt`), "missing captions route");
    assert.match(read(`entries/${LIVE}/captions.vtt`), /^WEBVTT/, "not a WEBVTT document");
  });

  test("a draft transcript's captions are not emitted either", () => {
    assert.ok(!exists(`entries/${HIDDEN}/captions.vtt`), "draft captions leaked");
  });

  // The fixture entry carries no heroImage, which makes it the only
  // unconditional cover for this: every real entry now has one, so the e2e
  // check skips. A page-relative or empty src renders as a broken image rather
  // than failing outright, so "no <img> at all" is the assertion that holds.
  test("an entry with no heroImage emits no image in its article", () => {
    const html = read(`entries/${LIVE}/index.html`);
    const article = html.slice(html.indexOf("<article"), html.indexOf("</article>"));
    assert.ok(!/<img/i.test(article), "an entry without a hero rendered an <img>");
  });

  test("llms.txt advertises the published transcript and not the draft", () => {
    const llms = read("llms.txt");
    assert.ok(llms.includes(`/entries/${LIVE}/transcript.md`), "transcript missing from llms.txt");
    assert.ok(!llms.includes(HIDDEN), "draft transcript listed in llms.txt");
  });
});

/**
 * robots.txt.
 *
 * Twice now an external tool has reported this site as opting out of AI
 * crawling when it does not. The file has always allowed everything; what it
 * also had was a comment block naming crawlers next to the word "Blocking",
 * which a scanner matching tokens rather than parsing the standard can read
 * backwards. These assertions lock the policy so an edit cannot quietly
 * reverse it, and so the explicit per-agent groups stay.
 */
// The edge function rewrites <path> to <path>index.md for any page when the
// client asks for Markdown. That blanket rule is only safe while every page
// actually has a twin: a rewrite pointing at a file that is not there would
// 404 a URL with perfectly good HTML, and only for agents, so nobody browsing
// would ever see it. This is the invariant that keeps it true.
describe("every page has a Markdown twin", () => {
  let result;

  before(() => {
    result = build();
  });

  // The error page is deliberately excluded: a twin has no reader, and it is
  // served by CloudFront's error response rather than reached by a rewrite.
  const EXEMPT = new Set(["404.html"]);

  const twinFor = (page) =>
    page.endsWith("index.html") ? `${page.slice(0, -"index.html".length)}index.md` : null;

  test("the build succeeded", () => {
    assert.equal(result.status, 0, result.stderr);
  });

  test("no HTML route is missing its twin", () => {
    const pages = htmlFiles()
      .map((file) => relative(DIST, file).split(sep).join("/"))
      .filter((page) => !EXEMPT.has(page));

    assert.ok(pages.length > 10, `expected many pages, found ${pages.length}`);

    const missing = pages.filter((page) => {
      const twin = twinFor(page);
      return !twin || !exists(twin);
    });

    assert.deepEqual(missing, [], `pages with no Markdown twin: ${missing.join(", ")}`);
  });

  test("every twin is non-empty and is Markdown, not HTML", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      const twin = twinFor(page);
      const body = read(twin).trim();
      assert.ok(body.length > 0, `${twin} is empty`);
      assert.ok(!/^<!doctype html/i.test(body), `${twin} is HTML, not Markdown`);
      assert.match(body, /^# \S/m, `${twin} has no heading`);
    }
  });

  test("every twin names its own source URL, so it can be cited", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      const twin = twinFor(page);
      assert.match(read(twin), /https:\/\/jgreen\.one\//, `${twin} carries no absolute URL`);
    }
  });

  test("every twin carries the contact footer", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      assert.match(read(twinFor(page)), /hello@jgreen\.one/, `${twinFor(page)} has no contact`);
    }
  });

  test("no twin leaks a literal undefined", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      assert.ok(!read(twinFor(page)).includes("undefined"), `'undefined' in ${twinFor(page)}`);
    }
  });

  test("every page advertises its twin with rel=alternate", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      const html = readFileSync(file, "utf-8");
      const link = html.match(
        /<link rel="alternate" type="text\/markdown" href="([^"]+)"/,
      );

      if (EXEMPT.has(page)) {
        assert.equal(link, null, `${page} has no twin and must not advertise one`);
        continue;
      }

      assert.ok(link, `${page} does not advertise its Markdown twin`);
      assert.match(link[1], /^https:\/\//, `${page} advertises a relative twin`);
    }
  });

  // Advertising a twin that is not there is worse than advertising none: an
  // agent follows the link and gets a 404 from a page that renders fine.
  test("every advertised twin resolves to a file that was built", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      const href = readFileSync(file, "utf-8").match(
        /<link rel="alternate" type="text\/markdown" href="([^"]+)"/,
      )[1];
      const target = href.replace("https://jgreen.one/", "");
      assert.ok(exists(target), `${page} advertises ${href}, which was not built`);
    }
  });

  // The link and the edge rewrite must agree, or an agent following the link
  // and an agent sending Accept get different URLs.
  test("the advertised twin is the one the edge rewrite produces", () => {
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      if (EXEMPT.has(page)) continue;
      const href = readFileSync(file, "utf-8").match(
        /<link rel="alternate" type="text\/markdown" href="([^"]+)"/,
      )[1];
      const fromRewrite = `https://jgreen.one/${twinFor(page)}`;
      assert.equal(href, fromRewrite, `${page}: link and rewrite disagree`);
    }
  });

  // The listing twin is generated from the same query as the HTML, so a page
  // showing an entry the twin omits would mean the two had drifted.
  test("a listing twin names the same entries as its HTML", () => {
    for (const page of ["blog/index.html", "projects/index.html", "entries/index.html"]) {
      const html = read(page);
      const twin = read(`${page.slice(0, -"index.html".length)}index.md`);
      const slugs = [...new Set([...html.matchAll(/href="\/entries\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
      assert.ok(slugs.length > 0, `no entries linked on ${page}`);
      for (const slug of slugs) {
        assert.ok(twin.includes(slug), `${slug} is on ${page} but not in its twin`);
      }
    }
  });
});

describe("robots.txt", () => {
  // Lazy: a describe body executes at collection time, before the build that
  // produces dist/, so reading here would assert against stale output.
  const robots = () => read("robots.txt");

  test("disallows nothing at all", () => {
    assert.ok(!/^\s*Disallow:\s*\S/m.test(robots()), "a Disallow directive appeared");
  });

  test("allows every agent through the wildcard group", () => {
    assert.match(robots(), /^User-agent:\s*\*\s*$/m);
    assert.match(robots(), /^Allow:\s*\/\s*$/m);
  });

  test("names the AI agents explicitly, so a token scanner cannot misread it", () => {
    for (const agent of [
      "Google-Extended",
      "GPTBot",
      "ClaudeBot",
      "anthropic-ai",
      "CCBot",
      "PerplexityBot",
      "Applebot-Extended",
    ]) {
      const group = new RegExp(`^User-agent:\\s*${agent}\\s*\\nAllow:\\s*/\\s*$`, "m");
      assert.match(robots(), group, `${agent} has no explicit Allow group`);
    }
  });

  // robots.txt says who may fetch. Content-Usage says what they may do with
  // what they fetched. The directive is scoped to the group it sits in, so
  // stating it once at the top of a file with fourteen groups would cover only
  // the first — which is the easy thing to get wrong here.
  describe("AI usage preferences", () => {
    // A blank line ends a group. Parsing without that rule would credit a
    // group with a directive written below the blank line, where it is
    // orphaned and means nothing — which is exactly the mistake this caught.
    const groups = () => {
      const found = [];
      let current = null;
      for (const line of robots().split(/\r?\n/)) {
        if (/^\s*$/.test(line)) {
          current = null;
          continue;
        }
        if (/^\s*#/.test(line)) continue;

        const agent = line.match(/^\s*user-agent:\s*(\S.*?)\s*$/i);
        if (agent) {
          if (!current || current.directives.length > 0) {
            current = { agents: [agent[1]], directives: [] };
            found.push(current);
          } else {
            current.agents.push(agent[1]);
          }
          continue;
        }

        const directive = line.match(/^\s*([a-z-]+)\s*:\s*(\S.*?)\s*$/i);
        if (!directive) continue;
        if (/^sitemap$/i.test(directive[1])) continue;
        assert.ok(
          current,
          `"${line.trim()}" sits outside any group — a blank line above it ended the group`,
        );
        current.directives.push({ name: directive[1].toLowerCase(), value: directive[2] });
      }
      return found;
    };

    test("every group states its usage preferences", () => {
      const all = groups();
      assert.ok(all.length > 1, "expected several user-agent groups");
      for (const group of all) {
        const usage = group.directives.filter((d) => d.name === "content-usage");
        assert.ok(
          usage.length > 0,
          `no Content-Usage in the group for ${group.agents.join(", ")}`,
        );
      }
    });

    test("the vocabulary is the one the drafts define", () => {
      // draft-ietf-aipref-vocab: three categories, values y or n. Not
      // Cloudflare's ai-train/ai-input with yes/no, which is a different
      // directive resting on an expired draft.
      for (const group of groups()) {
        for (const directive of group.directives.filter((d) => d.name === "content-usage")) {
          for (const pair of directive.value.split(",")) {
            assert.match(
              pair.trim(),
              /^(train-ai|ai-use|search)=(y|n)$/,
              `unrecognised preference "${pair.trim()}" for ${group.agents.join(", ")}`,
            );
          }
        }
      }
    });

    test("all three categories are stated, since an omitted one means unknown", () => {
      for (const group of groups()) {
        const stated = group.directives
          .filter((d) => d.name === "content-usage")
          .flatMap((d) => d.value.split(",").map((p) => p.trim().split("=")[0]));
        for (const category of ["train-ai", "ai-use", "search"]) {
          assert.ok(
            stated.includes(category),
            `${category} unstated for ${group.agents.join(", ")}`,
          );
        }
      }
    });

    test("every preference is permissive, matching the prose in the file", () => {
      for (const group of groups()) {
        for (const directive of group.directives.filter((d) => d.name === "content-usage")) {
          assert.ok(
            !/=n\b/.test(directive.value),
            `a preference is withheld for ${group.agents.join(", ")}: ${directive.value}`,
          );
        }
      }
    });

    // Both vocabularies are stated. Content-Usage is the standards-track rule;
    // Content-Signal is the spelling Cloudflare's network and the readiness
    // scanners actually read today. They are separate directive names, and
    // RFC 9309 requires a parser to ignore records it does not recognise, so
    // stating both costs a line and reaches both audiences.
    test("every group also states the Content-Signal spelling", () => {
      for (const group of groups()) {
        assert.ok(
          group.directives.some((d) => d.name === "content-signal"),
          `no Content-Signal in the group for ${group.agents.join(", ")}`,
        );
      }
    });

    test("Content-Signal uses its own vocabulary, not the IETF one", () => {
      for (const group of groups()) {
        for (const directive of group.directives.filter((d) => d.name === "content-signal")) {
          for (const pair of directive.value.split(",")) {
            assert.match(
              pair.trim(),
              /^(ai-train|ai-input|search)=(yes|no)$/,
              `unrecognised signal "${pair.trim()}" for ${group.agents.join(", ")}`,
            );
          }
        }
      }
    });

    // Saying the same thing twice is only safe while both copies agree. This
    // is the check that makes stating both defensible rather than a second
    // thing to forget to update.
    test("the two vocabularies say the same thing in every group", () => {
      // Content-Usage category -> the Content-Signal name for the same use.
      const EQUIVALENT = { "train-ai": "ai-train", "ai-use": "ai-input", search: "search" };
      const asBool = (value) => value === "y" || value === "yes";

      for (const group of groups()) {
        const read = (name) =>
          Object.fromEntries(
            group.directives
              .filter((d) => d.name === name)
              .flatMap((d) => d.value.split(",").map((p) => p.trim().split("=")))
              .map(([key, value]) => [key, asBool(value)]),
          );

        const usage = read("content-usage");
        const signal = read("content-signal");

        for (const [category, equivalent] of Object.entries(EQUIVALENT)) {
          assert.equal(
            signal[equivalent],
            usage[category],
            `${group.agents.join(", ")}: Content-Usage ${category} and ` +
              `Content-Signal ${equivalent} disagree`,
          );
        }
      }
    });

    test("an unrecognised directive does not disturb exclusion parsing", () => {
      const parsed = robotsParser("https://jgreen.one/robots.txt", robots());
      for (const agent of ["GPTBot", "ClaudeBot", "Google-Extended", "Googlebot", "SomeOtherBot"]) {
        assert.notEqual(
          parsed.isAllowed("https://jgreen.one/entries/this-site/", agent),
          false,
          `${agent} became disallowed`,
        );
      }
      assert.equal(parsed.getSitemaps().length, 1, "the sitemap was lost");
    });
  });

  test("points at the sitemap", () => {
    assert.match(robots(), /^Sitemap:\s*https:\/\/jgreen\.one\/sitemap-index\.xml\s*$/m);
  });

  // The checks above assert the file says the right thing. These assert it
  // MEANS the right thing, by running it through a real implementation of the
  // exclusion protocol rather than matching text. Allow/Disallow precedence
  // and group selection are exactly the parts a regex cannot judge.
  test("a real robots parser agrees every named agent is allowed", () => {
    const parsed = robotsParser("https://jgreen.one/robots.txt", robots());

    for (const agent of [
      "Google-Extended",
      "GoogleOther",
      "Googlebot",
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-SearchBot",
      "Claude-User",
      "anthropic-ai",
      "PerplexityBot",
      "Perplexity-User",
      "Applebot-Extended",
      "CCBot",
      "some-crawler-nobody-has-heard-of",
    ]) {
      for (const path of ["/", "/entries/", "/entries/this-site/", "/llms.txt"]) {
        assert.equal(
          parsed.isAllowed(`https://jgreen.one${path}`, agent),
          true,
          `${agent} is not allowed to fetch ${path}`,
        );
      }
    }
  });

  test("the parser finds the sitemap", () => {
    const parsed = robotsParser("https://jgreen.one/robots.txt", robots());
    assert.deepEqual(parsed.getSitemaps(), ["https://jgreen.one/sitemap-index.xml"]);
  });

  test("keeps the word Blocking away from the agent names", () => {
    // The prose that caused the misread. Explaining the policy is fine; doing
    // it beside a list of crawler names is what reads as a block list.
    assert.ok(!/Blocking/.test(robots()), "the word 'Blocking' is back in robots.txt");
  });
});

/**
 * Tag links.
 *
 * 22 tag pages existed for a long time with nothing linking to them: tags
 * rendered as <span>, and article pages showed none at all. Orphaned pages are
 * a weak quality signal and they spend crawl budget that the articles need.
 *
 * The first test here is the load-bearing one. It is what makes the "which
 * tags get a page?" decision safe to change later: cull the routes without
 * culling the links and this fails rather than shipping 404s.
 */
describe("tag links", () => {
  let result;

  before(() => {
    result = build();
  });

  /** Every internal href pointing into /tags/, deduplicated. */
  const tagHrefs = (html) => [
    ...new Set([...html.matchAll(/href="(\/tags\/[^"#?]*)"/g)].map((m) => m[1])),
  ];

  const allTagHrefs = () => {
    const found = new Map(); // href -> the page that links it
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      for (const href of tagHrefs(readFileSync(file, "utf-8"))) {
        if (!found.has(href)) found.set(href, page);
      }
    }
    return found;
  };

  const entryPages = () =>
    htmlFiles()
      .map((file) => relative(DIST, file).split(sep).join("/"))
      .filter((path) => /^entries\/[^/]+\/index\.html$/.test(path));

  test("the build succeeded", () => {
    assert.equal(result.status, 0, result.stderr);
  });

  // EntryCard renders an <li>, so every page that uses it has to supply the
  // list. A bare <li> is invalid HTML and the browser draws a stray marker for
  // it — which is exactly how this was found, on the tag pages.
  test("no card renders as a list item outside a list", () => {
    const LISTS = new Set(["ul", "ol", "menu"]);
    const orphans = [];
    for (const file of htmlFiles()) {
      const page = relative(DIST, file).split(sep).join("/");
      for (const li of parseHtml(readFileSync(file, "utf-8")).querySelectorAll("li")) {
        const parent = (li.parentNode?.rawTagName ?? "none").toLowerCase();
        if (!LISTS.has(parent)) orphans.push(`${page}: <li> inside <${parent}>`);
      }
    }
    assert.deepEqual(orphans, [], `list items outside a list:\n${orphans.join("\n")}`);
  });

  // THE HARD GATE. A linked tag with no page is strictly worse than the plain
  // text it replaced.
  test("every tag link resolves to a generated page", () => {
    const links = allTagHrefs();
    assert.ok(links.size > 0, "no tag links were emitted at all");

    const broken = [];
    for (const [href, linkedFrom] of links) {
      const target = `${href.replace(/^\//, "").replace(/\/$/, "")}/index.html`;
      if (!exists(target)) broken.push(`${href} (linked from ${linkedFrom}) -> ${target} missing`);
    }
    assert.deepEqual(broken, [], `broken tag links:\n${broken.join("\n")}`);
  });

  // Tags must carry a trailing slash: the unslashed form serves a 200 whose
  // canonical points at the slashed URL, so linking it asks a crawler to fetch
  // a duplicate shape for nothing.
  test("every tag link ends in a slash", () => {
    const offenders = [...allTagHrefs().keys()].filter((href) => !href.endsWith("/"));
    assert.deepEqual(offenders, [], `tag links missing a trailing slash: ${offenders.join(", ")}`);
  });

  test("entry cards link their tags rather than printing them as plain text", () => {
    // Listing pages are where EntryCard renders. Each shows entries that carry
    // tags, so each must emit tag links.
    for (const page of ["blog/index.html", "projects/index.html", "entries/index.html"]) {
      const links = tagHrefs(read(page));
      assert.ok(links.length > 0, `${page} renders cards but links no tags`);
    }
  });

  test("entry detail pages link their tags", () => {
    const pages = entryPages();
    assert.ok(pages.length > 0, "no entry pages were built");
    for (const page of pages) {
      const links = tagHrefs(read(page));
      assert.ok(links.length > 0, `${page} links none of its tags`);
    }
  });

  // The tag a page is *for* should still be discoverable from it, but a page
  // linking to itself is noise. Whichever way this lands, it must be deliberate.
  test("a tag page does not link to itself from its own cards", () => {
    const html = read("tags/astro/index.html");
    const selfLinks = [...html.matchAll(/href="\/tags\/astro\/"/g)].length;
    assert.equal(selfLinks, 0, "the astro tag page links back to itself");
  });
});
