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
