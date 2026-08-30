# Package updates — dependencies current + Astro 5 → 7 migration

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-08-27
**Updated**: 2026-08-27

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

## Phase 1 — safe minor/patch bumps

No code changes expected.

1. [ ] Bump: `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/typography`,
       `@astrojs/sitemap`, `@astrojs/check`, `astro-favicons`, `sass`,
       `typescript` (→ 5.9.3), `node-html-parser` (→ 7.1.0).
2. [ ] `npm run build` + `npm run check` clean.
3. [ ] `node scripts/validate_guides.mjs` still passes.
4. [ ] Visual smoke (`npm run preview`): `/`, `/blog`, `/projects`, `/entries`,
       `/entries/how-this-site-was-made`, `/tags`, `/tags/<tag>`, `/about`, `/contact`,
       `/404`. Check the avatar renders (exercises `node-html-parser`), code-fence
       highlighting, favicons in `<head>`.
5. [ ] Review `package-lock.json` diff; commit as one chunk.

## Phase 2 — Astro 5 → 6

Targets: `astro ^6.4.8`, `@astrojs/mdx ^5.0.6`. Prefer `npx @astrojs/upgrade` (resolves
astro + integrations together); otherwise pin manually. Read the official guide:
<https://docs.astro.build/en/guides/upgrade-to/v6/>

**Breaking changes that hit this repo:**

1. [ ] **Content config moves:** `src/content/config.ts` → **`src/content.config.ts`**.
       The old path is no longer read.
2. [ ] **Explicit loader:** the `entries` collection must declare a `loader`; `type:
       "content"` is removed. Use `glob()` from `astro/loaders`:
       ```ts
       import { glob } from 'astro/loaders';
       const entries = defineCollection({
         loader: glob({ pattern: '**/*.md', base: './src/content/entries' }),
         schema: z.object({ … }),
       });
       ```
3. [ ] **`slug` → `id`:** collection entries expose `id`, not `slug`. Fix:
       - `src/pages/entries/[slug].astro:8` — `params: { slug: entry.slug }` → use
         `entry.id` (keep the param name `slug` or rename the route to `[id].astro` +
         `params: { id: entry.id }` — pick one; renaming the file also changes nothing
         user-visible since the value is the same string).
       - `src/components/EntryCard.astro:34` — `` `/${collection}/${entry.slug}` `` →
         `entry.id`.
       - Confirm `id` shape for the glob loader (no leading slash, no `.md` extension).
4. [ ] **`entry.render()` removed:** `src/pages/entries/[slug].astro:14` —
       `const { Content } = await entry.render()` →
       `import { render } from 'astro:content'; const { Content } = await render(entry);`
5. [ ] **Zod 4:** import `z` from `astro/zod` (not `astro:content` — deprecated).
       Current schema uses `.max(160)`, `.enum([...])`, `.default(...)`, `.array(...)`,
       `.optional()`, `.describe(...)`, `z.coerce.date()`. All still supported in Zod 4;
       `.default()` values here are plain (no transforms) so they're fine. Verify build
       output and error messages.
6. [ ] **Markdown heading IDs:** trailing hyphens no longer stripped for headings ending
       in special chars. Repo headings are plain text — low impact, but note that deep
       links to headings could shift.
7. [ ] Transitive: **Vite 7**, **Shiki 4**. Check the code fences in
       `how-this-site-was-made.md` (bash / terraform / hcl) still highlight.
8. [ ] Not affected (verified): no `Astro.glob()`, no `getEntryBySlug()` /
       `getDataEntryById()`, no `<ViewTransitions />`, no adapter/SSR code, no i18n.
9. [ ] `npm run build` + `npm run check` + full visual smoke (as Phase 1, plus: every
       `/entries/<slug>` route resolves, sitemap.xml lists them, code highlighting).
10. [ ] Commit as one chunk.

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
7. [ ] `npm run build` + `npm run check` + thorough visual smoke: every page, markdown
       rendering (tables/lists/code in the blog post), favicon/manifest, sitemap,
       light/dark if themed, no console errors.
8. [ ] Commit as one chunk.

## Cross-task coordination

- **Task 6 (image asset management)** edits `src/content/config.ts`, `EntryCard.astro`,
  `ArticleLayout.astro`, and the `heroImage` convention. **Phase 2 here** moves that
  config file and changes `slug`→`id` in the same components. Do Phase 2 **before or
  together with** task 6 to avoid a merge collision, or sequence task 6 after Phase 2.
- **Task 7 (copyright year)** edits `Base.astro`; Phase 3's `compressHTML` change affects
  the same footer line. Whichever lands second re-verifies footer whitespace.

## Acceptance Criteria

- [ ] All packages at target versions; `npm outdated` clean except deliberate holds
      (`typescript` on 5.x, `node-html-parser` on 7.x) with the reason noted here.
- [ ] Each phase built, type-checked, guide-validated, visually smoke-tested, committed
      separately.
- [ ] `astro.config.mjs` and `src/content.config.ts` reflect the v7 shape; dead config
      (`remark-gfm` block) removed if GFM is native.
- [ ] Deploy the result and verify the live site (deploy is `./scripts/deploy.sh`).

## Notes

- `@astrojs/upgrade` is the path of least resistance for the Astro jumps — it bumps
  astro + all `@astrojs/*` integrations to a compatible set in one shot. Run it once per
  major (to 6, validate, then to 7).
- No test runner is wired up yet (see task 4). If task 4 lands first, add regression
  tests for the `slug`→`id` route generation and markdown rendering as part of Phase 2/3.
- Keep `package-lock.json` in the diff and actually read it — transitive majors (Vite,
  Shiki, Zod) ride along.

## Log

- 2026-08-27 Created. Researched npm registry for every dependency + the official Astro
  v6 and v7 upgrade guides. Astro is 2 majors behind; migration hits content-collection
  config location, `slug`→`id`, `entry.render()`, Zod 4 (Phase 2) and the Sätteri
  markdown-processor swap + `compressHTML` default (Phase 3). `typescript` held at 5.x
  (`@astrojs/check` peer cap). `astro-favicons` flagged as a compat risk for Astro 7.
  Not started.
