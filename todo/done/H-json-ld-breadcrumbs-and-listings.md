# JSON-LD: breadcrumbs and listing pages

**Priority**: MEDIUM
**Status**: DONE
**Created**: 2026-09-19
**Updated**: 2026-09-19

## Description

Task A shipped JSON-LD for the node types that describe *things*: `Article` /
`BlogPosting` on entries, `ProfilePage` + `Person` on `/about`, `WebSite` on the
homepage. Two gaps remain, both about **structure** rather than authorship:

1. **No `BreadcrumbList` anywhere.** One of the few schema types Google renders
   visibly in results, and the URL layout (`/entries/<slug>/`, `/tags/<tag>/`)
   maps to it cleanly.
2. **Listing pages carry no structured data at all.** `/blog/`, `/projects/`,
   `/entries/` and `/tags/` pass only `title` to `PageLayout` — no
   `description`, no `jsonLd`.

Found during the 2026-09-19 indexing audit (task F).

## Honest expectation-setting

**Breadcrumbs** are a real, rendered SERP feature — Google replaces the URL
line in a result with the breadcrumb trail. Worth having.

**`CollectionPage`/`ItemList` on a blog listing is not.** 🟡 Google does not
render a rich result for it; carousel rich results are limited to specific
supported types, and a personal blog index is not among them. The benefit is
semantic clarity for search and AI retrieval systems — it states plainly that
the page's purpose is to list these N entries — not a visible SERP change.
Do it for correctness and machine-readability, which is this site's whole
thesis, but **do not expect a ranking or appearance effect.** Verify the
carousel eligibility question directly before starting if it matters to the
decision.

## Part 1 — `BreadcrumbList`

### Verified requirements

From [Google's breadcrumb documentation](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), read 2026-09-19:

- `itemListElement`: an array of **at least two** `ListItem` objects, in order
- Each `ListItem` needs `position` (integer, **1-based**), `name`, and `item`
  (the URL)
- **The last item may omit `item`** — "If `item` isn't included for the last
  item, Google uses the URL of the containing page"
- "It is not required to include a breadcrumb `ListItem` for the top level path
  (your site's domain or host name), nor for the page itself"
- Multiple trails: wrap several `BreadcrumbList` objects in an array

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Entries",
      "item": "https://jgreen.one/entries/" },
    { "@type": "ListItem", "position": 2, "name": "jgreen.one: The Site as a Workbench" }
  ]
}
```

### The two-item minimum is the design constraint

| Page | Natural trail | Items | Valid? |
|---|---|---:|---|
| `/entries/<slug>/` | Entries → *Title* | 2 | ✅ |
| `/tags/<tag>/` | Tags → *tag* | 2 | ✅ |
| `/entries/<slug>/transcript/` | Entries → *Title* → Transcript | 3 | ✅ |
| `/blog/`, `/projects/`, `/about/` | *Blog* | 1 | ❌ below minimum |

For the one-level-deep pages, adding **Home** as position 1 reaches two items.
Google says including the site root is *not required* — it does not say it is
forbidden, and it is common practice.

- [x] **DECIDED: no breadcrumbs on top-level listing pages.** They would need a
      synthetic "Home" crumb purely to clear the two-item minimum, and the site
      nav already shows exactly that relationship. Trails are emitted only where
      one occurs naturally: `/entries/<slug>/`, `/entries/<slug>/transcript/`
      and `/tags/<tag>/`.

⚠️ **Markup must match visible content** — the rule already documented at the
top of `src/utils/structuredData.ts`. There is currently **no visible
breadcrumb UI on the site.** Emitting a trail the reader cannot see is exactly
the class of mismatch that rule exists to prevent.

**So this part is gated on a visible breadcrumb component**, or on a deliberate,
recorded decision that the nav plus the `<h1>` constitutes the visible
equivalent. Do not skip this question — it is the one that decides whether Part
1 ships at all.

### ✅ RESOLVED 2026-09-19 — the component was built

`src/components/Breadcrumbs.astro` renders the trail as a
`<nav aria-label="Breadcrumb">` with an ordered list, the current page marked
`aria-current="page"` and not linked. It renders nothing below two crumbs,
matching `breadcrumbJsonLd`, so **the visible trail and the markup appear and
disappear together** — they are built from one array per page and cannot
disagree. A build test enforces it: any page emitting a `BreadcrumbList` must
also contain `aria-label="Breadcrumb"`.

⚠️ **Jon should look at this one.** It is the only *visible* change in G or H.
On the transcript page it **replaced** the "← Back to the article" paragraph,
because the trail is a superset of it — it reaches the article *and* the entries
index, and marks the current page. No test depended on that link's text, and the
build assertion that the transcript links its article still passes. Reverting is
a one-line change if the old affordance is preferred.

## Part 2 — `CollectionPage` + `ItemList`

The standard pattern is `CollectionPage` → `mainEntity` → `ItemList` →
`itemListElement` of `ListItem`s carrying `position`, `url` and `name`.

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Blog",
  "url": "https://jgreen.one/blog/",
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1,
        "url": "https://jgreen.one/entries/this-site/",
        "name": "jgreen.one: The Site as a Workbench" }
    ]
  }
}
```

Applies to `/blog/`, `/projects/`, `/entries/`, and each `/tags/<tag>/`.
Positions must reflect the order actually rendered — the pages already sort via
`sortByDate`, so derive the list from the same array the template maps over
rather than re-sorting, or the markup and the page can drift.

`/tags/` itself lists *tags*, not entries. Either model it as an `ItemList` of
tag pages or leave it alone; decide and record.

**✅ DECIDED: left alone.** An `ItemList` of tag pages would describe a
navigation index rather than a collection of works, and the 13 single-entry tag
pages it points at are the weakest content on the site — enumerating them in
markup argues for indexing exactly what should not be indexed.

## Implementation

Both belong in `src/utils/structuredData.ts` beside the existing nodes, not in
component frontmatter — `.astro` files cannot be unit-tested, and structured
data is invisible on the page, so a mistake in it survives every visual check.

Follow the established shape in that file: an exported `…Node` interface, a
pure builder function, `present()` to drop absent keys, `absolute()` for URLs,
and `isoDateTime()` for any date.

### One API change to decide first

`SEO.astro` takes a single `jsonLd` prop and emits one `<script>`. An article
page needs **both** `BlogPosting` and `BreadcrumbList`. Options:

1. Let `jsonLd` accept an array — each node carries its own `@context`.
   `serializeJsonLd` already takes `unknown` and will stringify an array as-is.
2. Use a single `@graph` node: `{"@context": …, "@graph": [ … ]}`.
3. Emit multiple `<script>` blocks.

All three are valid JSON-LD. (2) is tidiest and keeps one `@context`; (1) is the
smallest diff. **Pick one before writing tests**, since it shapes every
signature.

**✅ DECIDED: (2) `@graph` — and the existing tests settled it, not taste.**
The build test asserts `json["@context"] === "https://schema.org"`, which a
top-level array cannot satisfy. `graphJsonLd` therefore wraps in `@graph`, but
**returns a lone node unwrapped**: other tests read `json["@type"]` directly, so
wrapping unconditionally would have broken every single-node page for no gain.
It also drops nulls, so `entryJsonLd` (null for a draft) and `breadcrumbJsonLd`
(null below two crumbs) can be passed straight in without a conditional.

## Testing

- **Unit** (`npm test`) — the bulk. Node shape, `position` 1-based and
  contiguous, last-item `item` omission, the ≥2 rule enforced (a builder handed
  one crumb must return `null`, matching how `entryJsonLd` returns `null` for a
  draft), absolute URLs, no `undefined` in output.
- **Build integration** (`npm run test:build`) — every listing page emits a
  parseable `ld+json` block, and its `ItemList` length matches the number of
  cards actually rendered in that page's HTML. That last assertion is what
  catches markup/content drift.
- **Validation** — re-run the schema.org validation used to close task A, and
  Google's Rich Results Test for the breadcrumb (needs a signed-in browser,
  same blocker as task A).

RED → GREEN → REFACTOR.

## Acceptance Criteria

- [x] Visible-breadcrumb question decided — component built, see above
- [x] `breadcrumbJsonLd()` + interface in `src/utils/structuredData.ts`, unit-tested (7 tests)
- [x] `collectionPageJsonLd()` + interface, unit-tested (5 tests); `graphJsonLd()` (4 tests)
- [x] Multi-node `jsonLd` approach chosen and implemented — `@graph`
- [x] `/blog/`, `/projects/`, `/entries/`, `/tags/<tag>/` emit `CollectionPage`
- [x] `/tags/` decision recorded — left alone
- [x] Build test: `ItemList` length matches rendered card count
- [x] Validated clean against schema.org — 34 blocks, 9 types, 15 properties
- [x] `npm run build` + `astro check` — no NEW errors (1 pre-existing remains)

## Notes

Task F Group 0a — meta descriptions for listing and tag pages — touches the same
four templates. Doing both in one pass is cheaper than two, but they are
genuinely independent; do not let one block the other.

### Sources (read 2026-09-19)

- [Google: Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [schema.org CollectionPage](https://schema.org/CollectionPage)
- Existing conventions: `src/utils/structuredData.ts` header comment

## Log

- [2026-09-19] Created from the task F indexing audit. Verified: no
  `Breadcrumb` string anywhere in `src/`; `jsonLd` passed only by
  `index.astro`, `about.astro` and `entries/[slug].astro`; the four listing
  templates pass `title` only.
- [2026-09-19] **DONE.** Implemented, validated and verified.

  **Added to `src/utils/structuredData.ts`:** `breadcrumbJsonLd()` (null below
  two crumbs; last crumb omits `item` so Google uses the containing page URL),
  `collectionPageJsonLd()` (`mainEntity` → `ItemList`, positions from the same
  array the template maps over), `graphJsonLd()` (combines nodes, drops nulls,
  leaves a lone node unwrapped), plus `ListItemNode`, `BreadcrumbNode`, `Crumb`,
  `ItemListNode`, `CollectionPageNode`.

  **New component:** `src/components/Breadcrumbs.astro`.

  **Wired into:** `entries/[slug].astro` (Article + BreadcrumbList in one
  `@graph`), `entries/[slug]/transcript.astro` (three-crumb trail, replacing the
  back link), `tags/[tag].astro` (CollectionPage + BreadcrumbList),
  `blog/`, `projects/` and `entries/` index pages (CollectionPage).
  `ArticleLayout` takes an optional `crumbs` prop.

  **Test changes beyond the new ones:** five existing structured-data
  assertions read `@type`/`author` off the top level, which `@graph` broke. Added
  a shape-tolerant `typedNode()`/`articleIn()` accessor rather than weakening
  them. `listing pages carry no article markup` previously asserted *zero*
  JSON-LD blocks; it now asserts no `Article`/`BlogPosting` **type**, which is
  truer to its name and still forbids exactly what it was written to forbid.

  **Verified:** unit 753 → **769**; build 88/89 → **91/92** (same single
  pre-existing media-manifest failure); e2e 145 → **151 passed, 2 skipped**;
  `astro check` back to the 1 pre-existing error after fixing 2 I introduced.

  **Validation:** every emitted `@type` and property checked against schema.org's
  official JSON-LD context (`https://schema.org/docs/jsonldcontext.json`).
  34 blocks scanned. Types: Article, BlogPosting, BreadcrumbList, CollectionPage,
  ItemList, ListItem, Person, ProfilePage, WebSite. All 15 properties known.
  Nothing unrecognised.

  **Bug caught during implementation:** the first `ItemList` emitted unslashed
  entry URLs (`/entries/foo`) while `entryJsonLd` and the canonical both use the
  slashed form. Structured data must reference canonical URLs; fixed in all four
  templates before finishing.

  **Not done, deliberately:** meta descriptions for listing and tag pages. That
  is task F item 0a, not this task, and the two are independent.
