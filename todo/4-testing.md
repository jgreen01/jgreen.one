# Comprehensive Testing

**Priority**: HIGH
**Status**: TODO
**Created**: 2026-06-27
**Updated**: 2026-06-27

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

- [ ] Valid full frontmatter parses without error
- [ ] `description` > 160 chars throws
- [ ] Missing `title` or `description` or `pubDate` throws
- [ ] `kind` not in `["blog", "project"]` throws; omitting `kind` defaults to `"blog"`
- [ ] `draft` defaults to `false`; `tags` defaults to `[]`
- [ ] `updatedDate` and `heroImage` are optional and absent without error

### 2. Unit — Component logic extracted to pure functions

The non-trivial logic inside components should be extracted to plain `.ts`
helpers so Vitest can test them without rendering Astro.

**`EntryCard` hero image path resolution** (`src/utils/heroImagePath.ts`):
- [ ] Path already starting with `/` is returned unchanged
- [ ] Path without `/` prefix gets `/entries/` prepended
- [ ] Empty string / undefined → `undefined` (no image rendered)

**`Avatar` SVG parsing** (`src/utils/parseAvatarSvg.ts`):
- [ ] Valid SVG string returns `{ attributes, innerHTML }`
- [ ] SVG string with no `<svg>` element throws `'Avatar: no <svg> element found'`
- [ ] Props passed in override matching SVG attributes; `viewBox` is always forced to `'0 0 1000 1000'`

**`SEO` URL/defaults logic** (`src/utils/seoMeta.ts`):
- [ ] No props → all defaults applied (title, description, image, type, site)
- [ ] `url: '/about'` → canonical is `'https://jgreen.one/about'`
- [ ] `image: '/og/post.png'` → OG image is `'https://jgreen.one/og/post.png'`
- [ ] Custom `site` prop overrides default base URL throughout

### 3. Unit — `validate_guides.mjs`

Spawn as a child process; assert exit code.

- [ ] Directory with clean files → exit 0
- [ ] File containing `secret` → exit 1, stderr names the file
- [ ] File containing `password` → exit 1
- [ ] File containing `apikey` → exit 1
- [ ] Keyword inside a code block (likely false positive) — document current behaviour

### 4. Unit — `deploy.sh` argument assembly

Mock `terraform`, `aws`, `npm` on `PATH`; capture exact args.

- [ ] `terraform output -json` is called from `infra/live/`
- [ ] `aws s3 sync ./dist s3://<bucket>/ --delete` — bucket name from Terraform output
- [ ] `aws cloudfront create-invalidation --distribution-id <id> --paths /*` — ID from Terraform output
- [ ] Empty / null Terraform output → script exits non-zero before touching AWS
- [ ] No credential values (tokens, keys) appear in any command string

### 5. Unit — Tag aggregation / draft filtering (pure logic helpers)

Extract to `src/utils/entries.ts` if not already pure:
- [ ] `filterDrafts([...])` — `draft: true` entries excluded, others pass through
- [ ] `aggregateTags([...])` — overlapping tags across entries are de-duplicated
- [ ] `sortByDate([...])` — newest `pubDate` first

### 6. Build integration (slow, opt-in)

Run `astro build` on the real content set; assert `dist/` structure.

- [ ] Build exits 0
- [ ] Routes present: `/index.html`, `/blog/index.html`, `/projects/index.html`,
  `/entries/index.html`, `/tags/index.html`, `/about/index.html`,
  `/contact/index.html`, `/404.html`, plus one `entries/<slug>/index.html`
- [ ] No `.html` file contains a literal `undefined` or `[object Object]`
- [ ] `sitemap-index.xml` exists and references at least one sitemap
- [ ] Draft entries (frontmatter `draft: true`) produce no route in `dist/`

### 7. E2E — Playwright (all pages, happy + edge paths)

`playwright.config.ts` — `webServer` starts `npm run preview` automatically.
Run on Chromium (default), Firefox, and WebKit (Safari).
Mobile tests use `devices['iPhone 13']` (375px viewport).

#### Setup / teardown
- Global setup asserts the preview server is reachable before any test runs.

#### Home (`/`)
- [ ] Page title contains "Jon Green"
- [ ] H1 visible
- [ ] Avatar SVG renders (element present, non-zero dimensions)
- [ ] At least one `<EntryCard>` present in the featured list
- [ ] "Browse Projects" and "Read the Blog" links resolve correctly
- [ ] No JS console errors

#### Blog (`/blog/`)
- [ ] H1 "Blog" visible
- [ ] Happy path: entry cards list, click first card → navigates to `/entries/<slug>/`
- [ ] Edge: if no blog entries, empty-state message renders (not an error/blank)

#### Projects (`/projects/`)
- [ ] H1 "Projects" visible
- [ ] Happy path: entry cards list, click first card → navigates to `/entries/<slug>/`
- [ ] Edge: if no project entries, empty-state message renders

#### All entries (`/entries/`)
- [ ] Lists both blog and project entries
- [ ] Each card links to `/entries/<slug>/`

#### Single entry (`/entries/<slug>/`)
- [ ] Article title matches frontmatter `title`
- [ ] Publish date rendered
- [ ] Tags listed; each tag links to `/tags/<tag>/`
- [ ] Body content rendered (not empty)
- [ ] Happy path: entry with hero image — `<img>` present, non-zero dimensions
- [ ] Edge: entry without hero image — no broken `<img>` element
- [ ] Edge: hero image 404 — `onerror` fires, container hidden (no broken image icon shown)

#### Tags index (`/tags/`)
- [ ] At least one tag link present
- [ ] Clicking a tag navigates to `/tags/<tag>/`

#### Tag detail (`/tags/<tag>/`)
- [ ] H1 contains the tag name
- [ ] Happy path: tag with matching entries — cards listed
- [ ] Edge: tag with zero matching entries — "No entries found" message (not an error)

#### About (`/about`)
- [ ] Page renders, no console errors
- [ ] `<title>` contains "About" or "Jon Green"

#### Contact (`/contact`)
- [ ] Page renders, no console errors

#### 404
- [ ] Requesting `/this-page-does-not-exist` renders the custom 404 page
- [ ] Response is not a blank page or server error
- [ ] Nav is present on 404 (user can navigate back)

#### Navigation
- [ ] Desktop: all nav links (`/`, `/projects/`, `/blog/`, `/about`, `/contact`) resolve without error
- [ ] Mobile (iPhone 13): hamburger button visible; clicking it shows mobile menu; clicking again hides it
- [ ] Mobile: each nav link in mobile menu navigates correctly
- [ ] Footer copyright year matches current year

#### SEO / meta
- [ ] `<title>` non-empty on every page
- [ ] `<meta name="description">` present and non-empty on every page
- [ ] `<link rel="canonical">` present on every page
- [ ] OG `og:title` and `og:image` present on every page

#### Dark mode
- [ ] With `colorScheme: 'dark'`, body background colour matches `--bg-color` dark value (`#1f2429`)
- [ ] Accent colour switches to `#38bdf8` (dark mode value)

### 8. Infrastructure (post-apply, boto3)

Run against real AWS; require credentials. Gate behind `workflow_dispatch` in CI.

- [ ] CloudFront distribution `E2G3DB3OD7XU6F` status is `Deployed`
- [ ] CloudFront `WebACLId` matches WAF ARN
- [ ] S3 bucket `jgreen-one-site` has `BlockPublicAcls`, `BlockPublicPolicy`,
  `IgnorePublicAcls`, `RestrictPublicBuckets` all `True`
- [ ] WAF Web ACL `jgreen-one-waf` exists; rate rule limit is 1000 per 300s
- [ ] SNS topic `jgreen-one-billing-alerts` exists in `us-east-1`
- [ ] 4 CloudWatch alarms exist: CloudFront threshold 5, S3 threshold 2, Route 53 threshold 1, total threshold 15
- [ ] AWS Budget `jgreen-one-monthly-budget` limit is $20.00

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

## Log

- 2026-06-27 Created. Researched against actual project structure (Avatar, SEO, EntryCard, Base, all pages). Added component/JS layer, full Playwright page matrix with happy+edge paths.
