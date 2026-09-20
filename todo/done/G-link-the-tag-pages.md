# Link the tag pages

**Priority**: MEDIUM
**Status**: DONE
**Created**: 2026-09-19
**Updated**: 2026-09-19

## Description

22 tag pages exist, are in the sitemap, and **nothing on the site links to
them** except the `/tags/` index. Tags render as `<span>`, not `<a>`
(`src/components/EntryCard.astro:52`), and article detail pages do not show
tags at all.

That is the worst of both arrangements: Google is asked to index 22 pages the
site itself does not consider worth linking to. Orphaned pages are a weak
quality signal and they waste crawl budget on a domain that is still fighting
to get its *articles* indexed.

Found during the 2026-09-19 indexing audit (task F).

## Scope

Two halves — the second is the more valuable one.

### 1. Make tags clickable in `EntryCard`

`src/components/EntryCard.astro:52` currently renders:

```astro
{data.tags.map((tag) => <span class="…">#{tag}</span>)}
```

Becomes an `<a href={`/tags/${encodeURIComponent(tag)}/`}>`. Use
`encodeURIComponent` and the **trailing slash** — both to match
`src/pages/tags/index.astro`, which already does exactly this, and because the
no-slash form serves a 200 with a canonical pointing at the slashed URL, so
linking the slashed form avoids a pointless duplicate-shape crawl.

Keep the pill styling; add a hover affordance. They must read as links, not
decoration.

⚠️ On `/tags/astro/`, every card will link back to `/tags/astro/` — the page
itself. Decide whether to suppress the self-link or leave it. Leaving it is
harmless; suppressing it is tidier.

**✅ DECIDED: suppressed.** `EntryCard` takes an optional `currentTag`; that one
tag renders as a `<span>` so it stays visible without linking to the page the
reader is already on. `src/pages/tags/[tag].astro` passes it.

### 2. Surface tags on the article page

`ArticleLayout` renders no tags. This is the higher-value half: the end of an
article is exactly where a reader wants more on the same subject, and it is
where an internal link earns the most. Listing pages are already a link hub;
article pages are currently dead ends.

- [ ] Render the entry's tags at the foot of `ArticleLayout`, linked the same way

## The decision this forces

Linking fixes the *orphan* problem. It does **not** fix the *thin* problem.

22 tags across 6 published entries:

| Entries | Tags |
|---:|---|
| 4 | astro, aws, cloudfront |
| 3 | testing, ai |
| 2 | workflow, terraform, iac, claude |
| **1** | **13 tags** — tailwind, seo, s3, open-data, notes, llm, javascript, gemini, data-visualization, d3, content-negotiation, conference, climate |

A single-entry tag page is an `<h1>` and one card. No description, linking or
markup makes that page worth indexing, and Google will keep declining it —
correctly.

**Three options, pick one and record it here:**

1. **Generate tag pages only for tags with ≥2 entries** (22 → 9). One filter in
   `getStaticPaths` in `src/pages/tags/[tag].astro`. Single-entry tags still
   render as text on the entry, just without a dedicated route.
2. **Keep all 22**, but `noindex` the thin ones and drop them from the sitemap.
   Keeps every URL working; stops asking Google to index them.
3. **Keep all 22 as-is.** Defensible — tag pages are navigation, and them not
   indexing costs nothing.

🟡 Recommendation is (1), but this is a judgement call about whether the URLs
have value to *readers* independent of search, and that is Jon's to make.

### ✅ DECIDED 2026-09-19 — option (3), keep all 22, cull left open

Chosen **in Jon's absence, deliberately as the least-irreversible option.**
Culling 13 routes is an information-architecture change with reader impact that
he explicitly reserved; linking is not blocked on it, and the orphan problem —
the actual finding — is fully fixed either way.

All 22 tags are now linked from entry cards and article pages, so **no tag page
is orphaned any more**. The thin-content question is untouched and still open:
the 13 single-entry pages remain exactly as weak as before, and Google will
keep declining them.

Adopting option (1) later is now *safe rather than risky*, which is the point
of having built the gate first: cull the routes without culling the links and
`every tag link resolves to a generated page` fails the build instead of
shipping 404s.

**If (1) or (2) is chosen, tags with no page must not render as links.** A
linked tag pointing at a culled page is a 404 — a strictly worse outcome than
today's spans. See the build test below, which exists to make that impossible.

## Testing

`.astro` files cannot be unit-tested, so:

- **Build integration** (`npm run test:build`) — the load-bearing one:
  **every tag link emitted anywhere in `dist/` must correspond to a generated
  tag page.** This is the invariant that makes the culling decision safe to
  change later without shipping 404s.
- **Playwright** (`npm run test:e2e`) — a tag pill on a card is a link, it
  navigates to the tag page, and that page lists the entry it came from.
- **Unit** — if a "does this tag have a page?" predicate is extracted (needed
  for options 1 and 2), it goes in `src/utils/entries.ts` beside
  `uniqueTags`/`aggregateTags` and is tested there.

RED → GREEN → REFACTOR, per AGENTS.md. Write the build assertion first.

## Acceptance Criteria

- [x] Tags in `EntryCard` are links, with trailing slash and `encodeURIComponent`
- [x] Tags render and link at the foot of the article page
- [x] Self-link behaviour on `/tags/<tag>/` decided — suppressed
- [x] Cull decision made — option (3), recorded above with reasoning
- [x] Build test: every emitted tag link resolves to a real page
- [x] Playwright covers pill → tag page → entry listed
- [x] `npm run build` + `astro check` — no NEW errors (see the pre-existing
      one noted below)
- [x] Sitemap URL count re-checked — still 36, nothing culled

## Notes

Nothing here helps if the articles themselves stay unindexed — see task F.
This is about not actively sending bad signals, plus a genuine reader
improvement on the article page.

Related: task F Group 0a (tag/listing meta descriptions) applies to whichever
tag pages survive this decision.

## Log

- [2026-09-19] Created from the task F indexing audit. Verified: tags are
  `<span>` at `EntryCard.astro:52`; `ArticleLayout` renders no tags;
  `/tags/index.astro` is the only page linking tag routes; 13 of 22 tags have a
  single entry.
- [2026-09-19] **DONE.** Implemented and verified.

  **Changed:** `src/utils/tags.ts` (new — `tagHref`, extracted so two components
  and a page build the same URL; `.astro` cannot be unit-tested);
  `tests/unit/tags.test.ts` (new, 5 tests); `src/components/EntryCard.astro`
  (tags → links, optional `currentTag` suppresses the self-link);
  `src/layouts/ArticleLayout.astro` (tags rendered at the foot, in a
  `not-prose` footer with an `sr-only` heading); `src/pages/tags/[tag].astro`
  (passes `currentTag`); `tests/integration/build.test.mjs` (+6 tests);
  `tests/e2e/site.spec.ts` (+4 tests).

  **Verified:** unit 748 → **753**; build 82/83 → **88/89**; e2e 137 → **145
  passed, 2 skipped**. `dist/` emits **22 unique tag links**, sitemap unchanged
  at 36 URLs, and an article page now links its own 6 tags.

  **Pre-existing failures confirmed NOT caused by this work and left alone:**
  1. `the media manifest is consistent with the content` — three
     `rocket-reliability-*.webp` need `npm run media:push` (uploads to S3).
  2. `astro check` reports **1 error**, `tests/unit/audit.test.ts:148` ts(2353)
     `'notes' does not exist in type`. Passes at runtime, fails type-checking.
     Baseline is therefore "1 error, 0 warnings, 2 hints", not zero.
  3. Flake: `entry pages carry a lastmod matching their publish date` can fail
     with ENOENT on `zz-integration-transcript-fixture.md` — a test-isolation
     issue between suites sharing `dist/`. Did not reproduce on re-run.

  **Gotcha worth keeping:** `astro check` writes "1 error" **singular**, so the
  grep `^- [0-9]+ (errors|warnings|hints)` recorded in these task docs silently
  misses a single error. Use `^- [0-9]+ errors\?`.

  **Noted, out of scope:** entry links are built without a trailing slash
  (`/${collection}/${entry.id}` in `EntryCard`), while tag links now carry one.
  Both resolve; the unslashed form serves 200 with a canonical to the slashed
  URL. Worth unifying some day.
- [2026-09-20] Follow-up from Jon's local review: **stray bullet on tag pages fixed.**

  `src/pages/tags/[tag].astro` rendered `EntryCard`'s `<li>` directly into
  `<main>` — the other four pages using the card all wrap it in
  `<ul class="list-none mt-8">`, this one never did. That is invalid HTML and the
  browser drew a default marker for it. Pre-existing, but it mattered more once
  this task made tag pages reachable from every card and article.

  Fixed in the HTML rather than with CSS: `list-style: none` would have hidden
  the marker while leaving a list item outside a list.

  Guarded by a new build test, **"no card renders as a list item outside a
  list"**, which walks every page in `dist/` with `node-html-parser` and asserts
  each `<li>` has a `ul`/`ol`/`menu` parent. Confirmed RED first — it reported
  `tags/ai/index.html: <li> inside <main>` — then GREEN after the fix.

  Verified: unit **769**, build **92/93** (same single pre-existing
  media-manifest failure), e2e **150 passed** + the known flaky `footer nazar`
  test, `astro check` unchanged at the 1 pre-existing error.

  On that flake: it is NOT caused by this work. Running only the nazar tests
  with `--repeat-each=3` and no tag or breadcrumb tests loaded still gave
  14 passed / 1 failed, so it fails roughly 1 in 15 on its own.

