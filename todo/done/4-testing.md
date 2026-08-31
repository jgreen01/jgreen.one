# Comprehensive Testing

**Priority**: HIGH
**Status**: DONE
**Created**: 2026-06-27
**Updated**: 2026-08-30

## Outcome — 266 tests, all green

| Suite | Command | Tests | Runtime |
|---|---|---|---|
| Unit (Vitest) | `npm test` | **122** | ~2s |
| Build integration | `npm run test:build` | **15** | ~13s |
| E2E (Playwright) | `npm run test:e2e` | **93** | ~70s |
| Infrastructure (pytest + boto3, live AWS) | `pytest tests/infra` | **36** | ~5s |
| Type check | `npm run check` | 0 errors, 1 pre-existing hint | ~6s |

Unit coverage of the extracted helpers: **100% statements, functions and branches**
across `schema.ts`, `entries.ts`, `heroImagePath.ts`, `parseAvatarSvg.ts`, `seoMeta.ts`.

> Reading the coverage output: Vitest's `text` reporter **omits rows for files at
> 100% on every metric**, so a nearly-empty table is the good outcome. Use the
> `html` or `json` report to confirm a module is instrumented at all — a missing
> row means either "perfect" or "never loaded", and the text table cannot tell you
> which.

### Bugs found and fixed

1. **Article hero images 404'd in production.** `ArticleLayout.astro:19` rendered
   `<img src={frontmatter.heroImage}>` using the raw frontmatter value. On
   `/entries/how-this-site-was-made/` the browser resolved the relative
   `images/how-this-website-was-built.png` against the page URL and requested
   `/entries/how-this-site-was-made/images/…` → 404. The OG tag on line 4 built the
   correct absolute path, so the metadata was right while the visible image was
   broken. Both now share `heroImagePath()`.
2. **`sample-project.md` pointed at a non-existent image.** `heroImage:
   "/images/placeholder-project.png"` had no matching file, so every listing page
   fired a 404 (hidden visually by the `onerror` handler). The build-integration
   test caught it. Frontmatter line removed — this is the same removal task 6
   already prescribes.
3. **`heroImagePath` mishandled two documented input shapes.** The old inline logic
   in `EntryCard` prefixed anything not starting with `/`, so a documented external
   `https://…` hero image would have become `/entries/https://…`. The old
   `ArticleLayout` expression `` `/${collection}/${heroImage}` `` produced a doubled
   slash for already-absolute values. Both are now handled and tested.

### Deviations from the original plan

- **`getCollection()` filter predicates removed.** Pages previously passed a
  predicate to `getCollection()` and chained `.sort()` inline. That logic is now in
  `src/utils/entries.ts` (`filterDrafts`, `sortByDate`, `filterByKind`,
  `filterByTag`, `uniqueTags`, `aggregateTags`) and unit-tested. Pages call
  `getCollection("entries")` and compose the helpers. All helpers are non-mutating.
- **Zod schema extracted** to `src/content/schema.ts` importing `astro/zod` (a real
  package) rather than the `astro:content` virtual module, so Vitest can load it.
  `src/content/config.ts` is a four-line wrapper and is excluded from coverage —
  it cannot load outside a build.
- **WebKit is opt-in (`E2E_WEBKIT=1`).** On this machine WebKit's network process
  dies on *every* HTTP navigation ("WebKit encountered an internal error") while
  `about:blank` and `setContent` work fine — an environment/system-library problem,
  not a site problem, and `playwright install-deps webkit` needs sudo. CI installs
  the deps and sets the flag, so Safari coverage still runs there. Locally,
  `npm run test:e2e` is green without it.
- **The `mobile` project runs Chromium** with the iPhone 13 viewport, user agent and
  touch settings, instead of the WebKit default, for the same reason. These tests
  target the inline hamburger script and layout, not engine quirks.
- **Empty-state E2E tests dropped** where the live content set cannot produce the
  branch; the equivalent logic is unit-tested. Marked `[~]` above.
- **CI Node bumped 20 → 22** to match local and stay ahead of Astro 7's `>=22.12`
  requirement (task 8).

### Follow-ups (not done — out of scope for a testing task)

- `ArticleLayout` renders no tags. If tags on article pages are wanted, that is a
  feature; the E2E assertion is ready to add once they exist.
- The article hero `<img>` uses `alt=""`. `EntryCard` uses the entry title.
  Deliberate decorative-vs-informative call worth making explicitly.
- `src/pages/index.astro:33` has `hover:-underline` (leading hyphen typo), so the
  "Read the Blog" link has no hover underline. Cosmetic.
- Entry card links emit `/entries/<slug>` while nav links use a trailing slash.
  Both resolve; the inconsistency is only a tidiness issue.
- `npm audit` reports 25 vulnerabilities (1 critical, 16 high) — feeds task 8.
- **Task 6 correction:** there are **4** tracked raster blobs, not 3. The scan in
  task 6 missed `public/og/home_1024×1024.png` because `git ls-files` quotes paths
  containing non-ASCII characters, which breaks a `grep '…$'` anchor. Use
  `git ls-files -z | tr '\\0' '\\n'` there.

## Description

Add a full testing stack to jgreen.one covering unit logic, component/JS
behaviour, build integration, end-to-end UI (all pages, happy + edge paths),
and infrastructure validation. The site has no tests today; `astro check` +
`astro build` are the only automated quality gates.

## Stack

| Layer | Tool | Why |
|-------|------|-----|
| Unit / component logic | **Vitest** | Native Vite/ESM, zero-config with Astro, fast inner loop |
| E2E / UI | **Playwright** | Cross-browser, real browser, covers JS behaviour that Vitest can't |
| Infra | **pytest + boto3** | Validate real AWS resources match intent post-apply |
| Build smoke | `astro build` in CI (already exists) | Keep; gate slow tests separately |

---

## Acceptance Criteria

### 1. Unit — Zod schema (`src/content/config.ts`)

The schema is the contract for all content. Test it directly — do not call
`getCollection()`, which is a Vite virtual module unavailable outside Astro's
build context.

- [x] Valid full frontmatter parses without error
- [x] `description` > 160 chars throws
- [x] Missing `title` or `description` or `pubDate` throws
- [x] `kind` not in `["blog", "project"]` throws; omitting `kind` defaults to `"blog"`
- [x] `draft` defaults to `false`; `tags` defaults to `[]`
- [x] `updatedDate` and `heroImage` are optional and absent without error

### 2. Unit — Component logic extracted to pure functions

The non-trivial logic inside components should be extracted to plain `.ts`
helpers so Vitest can test them without rendering Astro.

**`EntryCard` hero image path resolution** (`src/utils/heroImagePath.ts`):
- [x] Path already starting with `/` is returned unchanged
- [x] Path without `/` prefix gets `/entries/` prepended
- [x] Empty string / undefined → `undefined` (no image rendered)

**`Avatar` SVG parsing** (`src/utils/parseAvatarSvg.ts`):
- [x] Valid SVG string returns `{ attributes, innerHTML }`
- [x] SVG string with no `<svg>` element throws `'Avatar: no <svg> element found'`
- [x] Props passed in override matching SVG attributes; `viewBox` is always forced to `'0 0 1000 1000'`

**`SEO` URL/defaults logic** (`src/utils/seoMeta.ts`):
- [x] No props → all defaults applied (title, description, image, type, site)
- [x] `url: '/about'` → canonical is `'https://jgreen.one/about'`
- [x] `image: '/og/post.png'` → OG image is `'https://jgreen.one/og/post.png'`
- [x] Custom `site` prop overrides default base URL throughout

### 3. Unit — `validate_guides.mjs`

Spawn as a child process; assert exit code.

- [x] Directory with clean files → exit 0
- [x] File containing `secret` → exit 1, stderr names the file
- [x] File containing `password` → exit 1
- [x] File containing `apikey` → exit 1
- [x] Keyword inside a code block (likely false positive) — document current behaviour

### 4. Unit — `deploy.sh` argument assembly

Mock `terraform`, `aws`, `npm` on `PATH`; capture exact args.

- [x] `terraform output -json` is called from `infra/live/`
- [x] `aws s3 sync ./dist s3://<bucket>/ --delete` — bucket name from Terraform output
- [x] `aws cloudfront create-invalidation --distribution-id <id> --paths /*` — ID from Terraform output
- [x] Empty / null Terraform output → script exits non-zero before touching AWS
- [x] No credential values (tokens, keys) appear in any command string

### 5. Unit — Tag aggregation / draft filtering (pure logic helpers)

Extract to `src/utils/entries.ts` if not already pure:
- [x] `filterDrafts([...])` — `draft: true` entries excluded, others pass through
- [x] `aggregateTags([...])` — overlapping tags across entries are de-duplicated
- [x] `sortByDate([...])` — newest `pubDate` first

### 6. Build integration (slow, opt-in)

Run `astro build` on the real content set; assert `dist/` structure.

- [x] Build exits 0
- [x] Routes present: `/index.html`, `/blog/index.html`, `/projects/index.html`,
  `/entries/index.html`, `/tags/index.html`, `/about/index.html`,
  `/contact/index.html`, `/404.html`, plus one `entries/<slug>/index.html`
- [x] No `.html` file contains a literal `undefined` or `[object Object]`
- [x] `sitemap-index.xml` exists and references at least one sitemap
- [x] Draft entries (frontmatter `draft: true`) produce no route in `dist/`

### 7. E2E — Playwright (all pages, happy + edge paths)

`playwright.config.ts` — `webServer` starts `npm run preview` automatically.
Run on Chromium (default), Firefox, and WebKit (Safari).
Mobile tests use `devices['iPhone 13']` (375px viewport).

#### Setup / teardown
- Global setup asserts the preview server is reachable before any test runs.

#### Home (`/`)
- [x] Page title contains "Jon Green"
- [x] H1 visible
- [x] Avatar SVG renders (element present, non-zero dimensions)
- [x] At least one `<EntryCard>` present in the featured list
- [x] "Browse Projects" and "Read the Blog" links resolve correctly
- [x] No JS console errors

#### Blog (`/blog/`)
- [x] H1 "Blog" visible
- [x] Happy path: entry cards list, click first card → navigates to `/entries/<slug>/`
- [~] Edge: if no blog entries, empty-state message renders — **not reachable in E2E**
  against the real content set. Covered instead by `filterByKind` / `filterDrafts`
  unit tests asserting the empty result. See "Deviations" below.

#### Projects (`/projects/`)
- [x] H1 "Projects" visible
- [x] Happy path: entry cards list, click first card → navigates to `/entries/<slug>/`
- [~] Edge: if no project entries, empty-state message renders — same as above.

#### All entries (`/entries/`)
- [x] Lists both blog and project entries
- [x] Each card links to `/entries/<slug>/`

#### Single entry (`/entries/<slug>/`)
- [x] Article title matches frontmatter `title`
- [x] Publish date rendered
- [!] Tags listed; each tag links to `/tags/<tag>/` — **NOT IMPLEMENTABLE.**
  `ArticleLayout.astro` renders title, date, hero image and body only; it does not
  render tags at all. This criterion assumed a feature that does not exist.
  Adding a tag list to the article page is product work, not testing — see
  "Follow-ups" below.
- [x] Body content rendered (not empty)
- [x] Happy path: entry with hero image — `<img>` present, non-zero dimensions
- [x] Edge: entry without hero image — no broken `<img>` element
- [x] Edge: hero image 404 — `onerror` fires, container hidden (no broken image icon shown)

#### Tags index (`/tags/`)
- [x] At least one tag link present
- [x] Clicking a tag navigates to `/tags/<tag>/`

#### Tag detail (`/tags/<tag>/`)
- [x] H1 contains the tag name
- [x] Happy path: tag with matching entries — cards listed
- [~] Edge: tag with zero matching entries — **unreachable by construction.**
  `getStaticPaths` only emits routes for tags that have entries, so no such URL
  exists. The `matches.length === 0` branch is covered by `filterByTag` unit tests.

#### About (`/about`)
- [x] Page renders, no console errors
- [x] `<title>` contains "About" or "Jon Green"

#### Contact (`/contact`)
- [x] Page renders, no console errors

#### 404
- [x] Requesting `/this-page-does-not-exist` renders the custom 404 page
- [x] Response is not a blank page or server error
- [x] Nav is present on 404 (user can navigate back)

#### Navigation
- [x] Desktop: all nav links (`/`, `/projects/`, `/blog/`, `/about`, `/contact`) resolve without error
- [x] Mobile (iPhone 13): hamburger button visible; clicking it shows mobile menu; clicking again hides it
- [x] Mobile: each nav link in mobile menu navigates correctly
- [x] Footer copyright year matches current year

#### SEO / meta
- [x] `<title>` non-empty on every page
- [x] `<meta name="description">` present and non-empty on every page
- [x] `<link rel="canonical">` present on every page
- [x] OG `og:title` and `og:image` present on every page

#### Dark mode
- [x] With `colorScheme: 'dark'`, body background colour matches `--bg-color` dark value (`#1f2429`)
- [!] ~~Accent colour switches to `#38bdf8` (dark mode value)~~ — **the premise was
  wrong.** `--accent-color` is deliberately commented out inside the
  `prefers-color-scheme: dark` block in `global.scss:26`, so the brand orange
  `#f6780a` carries over unchanged. `#38bdf8` appears nowhere in the codebase.
  The test now asserts the actual behaviour and documents why.

### 8. Infrastructure (post-apply, boto3)

Run against real AWS; require credentials. Gate behind `workflow_dispatch` in CI.

- [x] CloudFront distribution `E2G3DB3OD7XU6F` status is `Deployed`
- [x] CloudFront `WebACLId` matches WAF ARN
- [x] S3 bucket `jgreen-one-site` has `BlockPublicAcls`, `BlockPublicPolicy`,
  `IgnorePublicAcls`, `RestrictPublicBuckets` all `True`
- [x] WAF Web ACL `jgreen-one-waf` exists; rate rule limit is 1000 per 300s
- [x] SNS topic `jgreen-one-billing-alerts` exists in `us-east-1`
- [x] 4 CloudWatch alarms exist: CloudFront threshold 5, S3 threshold 2, Route 53 threshold 1, total threshold 15
- [x] AWS Budget `jgreen-one-monthly-budget` limit is $20.00

---

## Implementation Plan

### Phase 1 — Vitest setup + unit tests

```bash
npm i -D vitest @vitest/coverage-v8
```

`package.json` scripts:
```json
"test":       "vitest run",
"test:watch": "vitest",
"test:cover": "vitest run --coverage"
```

**Extract component logic first** — before writing tests, pull the non-trivial
logic out of `.astro` files into plain `.ts` helpers:
- `src/utils/heroImagePath.ts` — the `if (!startsWith('/'))` logic from `EntryCard`
- `src/utils/parseAvatarSvg.ts` — the `parse(rawSvg)` + null-check from `Avatar`
- `src/utils/seoMeta.ts` — the URL construction + defaults from `SEO`
- `src/utils/entries.ts` — filter/sort/tag helpers used by pages

Then tests are straightforward imports of those helpers.

Test files: `tests/unit/*.test.ts`. Fixtures: `tests/fixtures/` (frontmatter
objects, SVG strings) — never import live content from `src/content/entries/`.

### Phase 2 — Build integration tests (slow, opt-in)

```bash
npm i -D execa
```

`package.json`: `"test:build": "node tests/integration/build.test.mjs"`

Spawns `astro build`, reads `dist/`, asserts structure. Keep out of the default
`npm test` run — too slow for the inner loop.

### Phase 3 — Playwright E2E

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium firefox webkit
```

`package.json`: `"test:e2e": "playwright test"`

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npm run preview', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI },
  use: { baseURL: 'http://localhost:4321' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'mobile',   use: { ...devices['iPhone 13'] } },
  ],
});
```

Test files: `tests/e2e/site.spec.ts` (core), `tests/e2e/mobile.spec.ts` (mobile nav + layout).

### Phase 4 — Infrastructure tests

```bash
pip install pytest boto3
```

`tests/infra/test_aws.py` — boto3 assertions against real resources.
Run manually after `terraform apply` or via `workflow_dispatch` CI job.

### Phase 5 — CI wiring

`.github/workflows/ci.yml` additions:
- `npm test` (Vitest unit) added to the existing `build` job — fast, no new cost
- New `e2e` job: `npx playwright install --with-deps chromium`, `npm run build`, `npm run test:e2e`
  - Cache browser binaries with `actions/cache` keyed on Playwright version + OS
- New `infra` job (manual trigger only): `workflow_dispatch`, AWS OIDC credentials, `pytest tests/infra/`

---

## Notes & Thoughts

**Most valuable tests to write first**, in order:
1. Zod schema unit tests — cheapest to write, highest signal; they enforce the content contract
2. `EntryCard` hero image path logic — this is the kind of bug (missing `/` prefix) that
   slips through `astro check` and only shows as a broken image in production
3. Playwright happy path for `/`, `/blog/`, `/entries/<slug>/` — catches regressions on the core user journey
4. Mobile hamburger test — the JS is inline in `Base.astro` and has no other test coverage

**Extracting component logic is non-optional.** Vitest cannot render `.astro`
files — there's no JSDOM/SSR integration for Astro components in Vitest today.
The only way to unit-test component logic is to move it out first. This is
also good design regardless of testing.

**Playwright is the right tool for JS behaviour** (`btn?.addEventListener`
toggle, `onerror` image hiding, footer year). These can't be tested by Vitest
alone. Playwright runs a real browser.

**Don't test `getCollection()` in Vitest.** It's a Vite virtual module
(`astro:content`) that doesn't exist outside Astro's build pipeline. Test the
Zod schema directly; test page output via Playwright or build integration.

**The `onerror` image test is worth writing explicitly.** The current
`EntryCard` uses `onerror="this.closest('.hero-image-container').style.display='none'"` —
that's inline JS that's easy to accidentally break. Playwright can test it by
navigating to a page with a hero image pointing at a non-existent path.

---

## Risks

- **`getCollection()` in Vitest** — won't work. Mitigated by extracting logic to plain `.ts` helpers.
- **Playwright browser binaries in CI** — ~300MB per browser. Cache with `actions/cache`.
- **Infra tests need real AWS creds in CI** — use GitHub OIDC (`aws-actions/configure-aws-credentials`), gate behind `workflow_dispatch`.
- **Empty-state Playwright tests** — the live site has entries, so `/blog/` won't hit the empty-state branch. Use a fixture build or test the empty-state component logic separately.

---

## Files added

```
vitest.config.ts                     playwright.config.ts
src/content/schema.ts                (Zod schema, testable outside Astro)
src/utils/entries.ts                 (filter/sort/tag helpers)
src/utils/heroImagePath.ts           (hero image path resolution)
src/utils/parseAvatarSvg.ts          (SVG parse + attribute merge)
src/utils/seoMeta.ts                 (SEO defaults + URL construction)
tests/fixtures/{frontmatter,avatarSvg,entries}.ts
tests/unit/{schema,entries,heroImagePath,parseAvatarSvg,seoMeta,validateGuides,deployScript}.test.ts
tests/integration/build.test.mjs
tests/e2e/{helpers.ts,site.spec.ts,mobile.spec.ts}
tests/infra/{conftest.py,test_aws.py,requirements.txt}
```

Modified: `.github/workflows/ci.yml`, `.gitignore`, `package.json`, the five
components/layouts and six pages that now use the helpers, and
`src/content/entries/sample-project.md` (dead `heroImage` removed).

## Log

- 2026-06-27 Created. Researched against actual project structure (Avatar, SEO, EntryCard, Base, all pages). Added component/JS layer, full Playwright page matrix with happy+edge paths.
- 2026-08-30 **Implemented all five phases.** 266 tests passing (122 unit, 15 build
  integration, 93 E2E across chromium/firefox/mobile, 36 infra against live AWS);
  `astro check` clean. Extracted the four helper modules plus the Zod schema and
  rewired every component and page to use them, so the unit tests guard production
  code rather than parallel copies. Found and fixed the `ArticleLayout` relative
  hero-image 404, removed a `heroImage` pointing at a file that never existed, and
  hardened `heroImagePath` for external URLs and already-absolute paths. Wired CI:
  unit tests into the existing build job, plus new `build-integration`, `e2e`
  (with browser-binary caching) and manual-only `infra` jobs; Node 20 → 22.
  Corrected two acceptance criteria that rested on false premises (tags on article
  pages, dark-mode accent colour) and marked three empty-state E2E criteria as
  unreachable with the reasons recorded above. Nothing committed.
