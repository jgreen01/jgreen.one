# Package updates — dependencies current + Astro 5 → 7 migration

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-08-27
**Updated**: 2026-08-30

## Description

Bring all dependencies to current versions. Most are routine minor/patch bumps; **Astro
is two majors behind (5 → 7)**, which is a real migration with breaking changes that hit
this repo directly (content-collection config location, `slug`→`id`, Zod 4, the Markdown
processor swap in v7).

Do it in **three phases**, each its own validate-and-commit chunk. Don't lump the Astro
majors in with the safe bumps.

## Versions (from npm registry, checked 2026-08-27)

| Package | Current | Target | Notes |
|---|---|---|---|
| `tailwindcss` | 4.1.12 | 4.3.3 | minor |
| `@tailwindcss/vite` | 4.1.12 | 4.3.3 | minor; peer `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` |
| `@tailwindcss/typography` | 0.5.16 | 0.5.20 | patch |
| `@astrojs/sitemap` | 3.4.2 | 3.7.3 | minor; no peer dep declared |
| `@astrojs/check` | 0.9.4 | 0.9.10 | patch; **peer `typescript ^5 \|\| ^6`** → caps TS |
| `astro-favicons` | 3.1.5 | 3.1.6 | patch; peer `astro >=4.0.0` (loose); last publish 2026-03-08 |
| `sass` | 1.90.0 | 1.103.1 | minor |
| `typescript` | 5.9.2 | **5.9.3** | stay on 5.x — `@astrojs/check` doesn't allow TS 7 yet |
| `node-html-parser` | 7.0.1 | **7.1.0** | used in `src/components/Avatar.astro` (`parse`); 9.x is 2 majors, review separately |
| `remark-gfm` | 4.0.1 | 4.0.1 | already latest — no-op (may be removed entirely in Phase 3) |
| `astro` | 5.12.9 | **7.2.9** (via 6.4.8) | two majors — Phases 2 & 3 |
| `@astrojs/mdx` | 4.3.3 | **7.0.8** (via 5.0.6) | tracks Astro majors; **no 6.x line exists** — use 5.0.6 for Astro 6, 7.0.8 for Astro 7 |
| `@astrojs/markdown-remark` | — | 7.2.4 | **new dep**, only if Phase 3 needs the unified pipeline back |

- Node: 22.18.0 installed; Astro 7 requires `>=22.12.0` ✓.
- npm 11.9.0 → 11.19.1 available (global, optional, mention only).
- `typescript` 7.0.2 exists but **hold** — `@astrojs/check@0.9.10` peers `^5.0.0 || ^6.0.0`.
  Revisit TS 7 when `@astrojs/check` supports it.

## Testing — you now have a regression net, use it

Task 4 (done 2026-08-30) added 266 tests. **This migration is exactly what they were
built for.** Run the full gate after *every* phase, not just at the end:

```bash
npm run check        # type errors
npm test             # 122 unit — schema, helpers, deploy.sh, validate_guides
npm run test:build   # 15 — dist/ shape, every route, no broken image refs
npm run test:e2e     # 93 local / 133 in CI — real browsers, every page
```

`pytest tests/infra` is unaffected by package versions; skip it here.

What each suite buys you on an Astro major:

| Suite | Catches |
|---|---|
| `npm test` | schema behaviour under Zod 4, helper regressions, `deploy.sh` argv drift |
| `npm run test:build` | a route that silently stops being emitted, a drafts leak, a broken image reference, missing/relative canonical or `og:image` |
| `npm run test:e2e` | rendering, the mobile menu script, dark mode, the `onerror` handler, and every `/entries/<slug>` link actually resolving — the `slug`→`id` blast radius |

**Also note:** CI already runs Node 22 (bumped in task 4), which satisfies Astro 6 and
7's `>=22.12` requirement. Nothing to do there.

## Phase 1 — safe minor/patch bumps

No code changes expected.

1. [ ] Bump: `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/typography`,
       `@astrojs/sitemap`, `@astrojs/check`, `astro-favicons`, `sass`,
       `typescript` (→ 5.9.3), `node-html-parser` (→ 7.1.0).
2. [ ] Full gate: `npm run check`, `npm test`, `npm run test:build`, `npm run test:e2e`
       — all green.
3. [ ] `node scripts/validate_guides.mjs` still passes.
4. [ ] Watch two in particular: `node-html-parser` backs `parseAvatarSvg`
       (`tests/unit/parseAvatarSvg.test.ts` covers it, including against the real
       74 KB `avatar.svg`), and `@astrojs/check` caps TypeScript at 5.x.
5. [ ] Eyeball `npm run preview` once for anything tests cannot see — code-fence
       highlighting colours, favicon rendering, general layout.
6. [ ] Review `package-lock.json` diff; commit as one chunk.

## Phase 2 — Astro 5 → 6

Targets: `astro ^6.4.8`, `@astrojs/mdx ^5.0.6`. Prefer `npx @astrojs/upgrade` (resolves
astro + integrations together); otherwise pin manually. Read the official guide:
<https://docs.astro.build/en/guides/upgrade-to/v6/>

**Breaking changes that hit this repo:**

1. [ ] **Content config moves:** `src/content/config.ts` → **`src/content.config.ts`**.
       The old path is no longer read. Since task 4 the schema lives separately in
       **`src/content/schema.ts`** and `config.ts` is a four-line wrapper — so the move
       is just that wrapper, and its import becomes `./content/schema`.
       **Leave `schema.ts` where it is**; `tests/unit/schema.test.ts` imports it by path.
2. [ ] **Explicit loader:** the `entries` collection must declare a `loader`; `type:
       "content"` is removed. Use `glob()` from `astro/loaders`:
       ```ts
       import { defineCollection } from 'astro:content';
       import { glob } from 'astro/loaders';
       import { entrySchema } from './content/schema';

       const entries = defineCollection({
         loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
         schema: entrySchema,
       });
       ```
3. [ ] **`slug` → `id`:** collection entries expose `id`, not `slug`. Four places now:
       - `src/pages/entries/[slug].astro:8` — `params: { slug: entry.slug }` → use
         `entry.id` (keep the param name `slug` or rename the route to `[id].astro` +
         `params: { id: entry.id }` — pick one; renaming the file also changes nothing
         user-visible since the value is the same string).
       - `src/components/EntryCard.astro:34` — `` `/${collection}/${entry.slug}` `` →
         `entry.id`.
       - **`tests/fixtures/entries.ts`** — every fixture has a `slug` field and
         `FixtureEntry` types it. Rename to `id` so the fixtures keep matching reality.
       - **`tests/e2e/site.spec.ts`** — asserts entry hrefs match
         `/^\/entries\/[^/]+\/?$/` and navigates by the href it reads. Should survive a
         rename that produces identical URLs; **run it to confirm** rather than assuming.
       - Confirm `id` shape for the glob loader (no leading slash, no `.md` extension).
         If `id` keeps the extension, **every entry URL changes** — `test:build` and
         `test:e2e` will both go red, which is the point.
4. [ ] **`entry.render()` removed:** `src/pages/entries/[slug].astro:14` —
       `const { Content } = await entry.render()` →
       `import { render } from 'astro:content'; const { Content } = await render(entry);`
5. [ ] **Zod 4:** `src/content/schema.ts` already imports `z` from `astro/zod` (task 4
       did this so the schema could be unit-tested), so the deprecated `astro:content`
       import is not in play. The schema uses `.max(160)`, `.enum([...])`,
       `.default(...)`, `.array(...)`, `.optional()`, `.describe(...)`,
       `z.coerce.date()` — all still supported in Zod 4, and the `.default()` values are
       plain with no transforms. **`tests/unit/schema.test.ts` has 20 tests covering
       exactly these behaviours**, including boundary cases (160 vs 161 chars) and
       coercion failures. If Zod 4 changes anything, that file tells you precisely what.
6. [ ] **Markdown heading IDs:** trailing hyphens no longer stripped for headings ending
       in special chars. Repo headings are plain text — low impact, but note that deep
       links to headings could shift.
7. [ ] Transitive: **Vite 7**, **Shiki 4**. Check the code fences in
       `how-this-site-was-made.md` (bash / terraform / hcl) still highlight.
8. [ ] Not affected (verified): no `Astro.glob()`, no `getEntryBySlug()` /
       `getDataEntryById()`, no `<ViewTransitions />`, no adapter/SSR code, no i18n.
9. [ ] **Full gate.** `npm run check`, `npm test`, `npm run test:build`,
       `npm run test:e2e`. Expect breakage here and read each failure rather than
       bulk-fixing — the likely ones:
       - `tests/fixtures/entries.ts` / `tests/unit/entries.test.ts` if `slug` → `id`
       - `tests/unit/schema.test.ts` if Zod 4 changed a message or a coercion
       - `tests/integration/build.test.mjs` if any route path changed (it asserts the
         exact set of top-level routes and that at least one `entries/<slug>/` page and
         one `tags/<tag>/` page exist)
       - `tests/e2e/site.spec.ts` if entry URLs changed shape
10. [ ] Eyeball what tests cannot: code-fence highlighting under Shiki 4, and heading
        anchor IDs if you care about existing deep links.
11. [ ] Commit as one chunk.

## Phase 3 — Astro 6 → 7

Targets: `astro ^7.2.9`, `@astrojs/mdx ^7.0.8`. Read the guide:
<https://docs.astro.build/en/guides/upgrade-to/v7/>

**Breaking changes that hit this repo:**

1. [ ] **Markdown processor swap (the big one):** Astro 7 renders `.md`/`.mdx` with its
       native processor (Sätteri) instead of remark/rehype. **remark/rehype plugins
       silently stop** — the build succeeds, the effect just vanishes. This repo config
       has `markdown: { remarkPlugins: [remarkGfm] }`.
       - First: test whether GFM (tables, strikethrough, task lists, autolinks) is
         **native** in the new processor. If yes → **delete `remark-gfm` from
         `package.json` and drop the `markdown.remarkPlugins` block from
         `astro.config.mjs` entirely.**
       - If some GFM feature is missing → install `@astrojs/markdown-remark` and restore
         the unified pipeline (`markdown: { processor: unified() }` or the exact API the
         v7 guide specifies). Note `@astrojs/mdx@7.0.8` also peers
         `@astrojs/markdown-satteri ^0.3.1`.
2. [ ] **`compressHTML` default `true` → `'jsx'`:** whitespace between inline elements
       now stripped by JSX rules. Check `Base.astro:57` footer (` — `, ` • ` separators),
       nav links, and anywhere text sits between inline elements. Fix with explicit
       `{" "}` or set `compressHTML: true` in config to keep old behavior.
       **This overlaps task 7** — coordinate.
       Two existing tests give partial cover: `tests/e2e/site.spec.ts` asserts the footer
       contains the current year, and the mobile spec clicks nav links by exact accessible
       name (`{ name, exact: true }`) — which **will fail if collapsing whitespace
       changes a link's accessible name**. Neither notices a lost separator inside a run
       of footer text, so read the rendered footer yourself.
3. [ ] **Rust compiler is stricter:** unclosed tags / invalid nesting now error (no
       auto-correction). Repo looks clean (`<li>` always inside `<ul>`, `<img>` inside
       `<article>`), but a full `npm run build` will surface anything. CSS may serialize
       differently (color names → hex) — visually identical, ignore.
4. [ ] Transitive: **Vite 8**. `@tailwindcss/vite` peer already allows `^8`. Skim the
       Vite 8 migration notes for anything touching `vite.plugins` in `astro.config.mjs`.
5. [ ] Not affected (verified): no experimental flags in config, no `src/fetch.ts`, no
       `@astrojs/db`, no `astro:transitions` internals.
6. [ ] **`astro-favicons` compat check:** peer is `astro >=4.0.0` (loose, unverified for
       7) and last publish was 2026-03-08. After upgrading, confirm favicons + manifest
       still generate (check `dist/` and `<head>`). If broken: check the repo
       (<https://github.com/ACP-CODE/astro-favicons>) for an Astro 7 release/issue;
       fallback is Astro's built-in `<link rel="icon">` + a static `manifest.webmanifest`,
       or `@vite-pwa/astro`.
7. [ ] **Full gate**, plus WebKit: `E2E_WEBKIT=1 npm run test:e2e` (CI does this
       automatically). The Rust compiler's stricter HTML handling and the CSS
       serialization change are exactly the kind of thing one engine renders differently.
       If WebKit will not launch locally, push and read the CI run instead — it is the
       only place Safari has actually been exercised.
8. [ ] Eyeball what tests cannot: markdown rendering in the blog post (tables, lists,
       code fences) after the processor swap, favicon/manifest generation, sitemap.
9. [ ] Commit as one chunk.

## Cross-task coordination

- **Task 6 (image asset management)** touches `src/content/schema.ts`,
  `src/utils/heroImagePath.ts` and the `heroImage` convention. **Phase 2 here** moves
  `src/content/config.ts` → `src/content.config.ts` and changes `slug`→`id` in
  `EntryCard.astro`. The file overlap is smaller than it was before task 4 (the schema
  and the path logic now live in their own modules), but both tasks rewrite
  `tests/unit/heroImagePath.test.ts` and `tests/fixtures/entries.ts`. **Do Phase 2
  first** — task 6 also has its own blocker (step 0) that needs the same GitHub OIDC
  work, so it is not ready to start anyway.
- **Task 7 (copyright year)** edits `Base.astro`; Phase 3's `compressHTML` change affects
  the same footer line. Whichever lands second re-verifies footer whitespace.
- **Task 4 is done** — the test stack exists and CI runs it on every push. Any red test
  in this migration is a signal, not an obstacle to route around.

## Acceptance Criteria

- [ ] All packages at target versions; `npm outdated` clean except deliberate holds
      (`typescript` on 5.x, `node-html-parser` on 7.x) with the reason noted here.
- [ ] Each phase committed separately, with the **full gate** green before each commit:
      `npm run check`, `npm test`, `npm run test:build`, `npm run test:e2e`,
      `node scripts/validate_guides.mjs`.
- [ ] Any test changed during the migration was changed **because the behaviour
      deliberately changed**, with the reason recorded in the Log — never to make a
      failure go away.
- [ ] CI green on the pushed branch, including the WebKit project.
- [ ] `astro.config.mjs` and `src/content.config.ts` reflect the v7 shape; dead config
      (`remark-gfm` block) removed if GFM is native.
- [ ] Deploy the result and verify the live site (deploy is `./scripts/deploy.sh`), then
      `pytest tests/infra` to confirm the deploy did not disturb the bucket or CDN.

## Notes

- `@astrojs/upgrade` is the path of least resistance for the Astro jumps — it bumps
  astro + all `@astrojs/*` integrations to a compatible set in one shot. Run it once per
  major (to 6, validate, then to 7).
- No test runner is wired up yet (see task 4). If task 4 lands first, add regression
  tests for the `slug`→`id` route generation and markdown rendering as part of Phase 2/3.
- Keep `package-lock.json` in the diff and actually read it — transitive majors (Vite,
  Shiki, Zod) ride along.
- `npm audit` currently reports **25 vulnerabilities (1 critical, 16 high)** after the
  test tooling landed. Check whether the majors here clear them; run `npm audit` before
  and after each phase and note the delta. Do not run `npm audit fix --force` — it will
  happily downgrade or major-bump packages behind your back.

## Log

- 2026-08-27 Created. Researched npm registry for every dependency + the official Astro
  v6 and v7 upgrade guides. Astro is 2 majors behind; migration hits content-collection
  config location, `slug`→`id`, `entry.render()`, Zod 4 (Phase 2) and the Sätteri
  markdown-processor swap + `compressHTML` default (Phase 3). `typescript` held at 5.x
  (`@astrojs/check` peer cap). `astro-favicons` flagged as a compat risk for Astro 7.
  Not started.
- 2026-08-30 **Revised after task 4 landed.** There is now a 266-test regression net,
  which changes how this migration should be run: added a "use the regression net"
  section with the full gate to run after *every* phase, and per-phase notes on which
  test files each breaking change will hit. Corrected Phase 2 for the refactor — the
  Zod schema now lives in `src/content/schema.ts` (already importing `astro/zod`, so
  the deprecated `astro:content` import is a non-issue, and 20 tests pin its behaviour),
  and `config.ts` is a four-line wrapper, so the v6 file move is smaller than described.
  `slug`→`id` now also hits `tests/fixtures/entries.ts` and `tests/e2e/site.spec.ts`.
  Node 22 in CI is already done. Noted the 25 `npm audit` findings and that WebKit only
  runs in CI. Still not started.
