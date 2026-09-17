# Add JSON-LD structured data

**Priority**: MEDIUM
**Status**: BLOCKED — one check needs a Google sign-in only Jon has
**Created**: 2026-09-14
**Updated**: 2026-09-16

## Description

The site emits no structured data at all. Open Graph and Twitter Card tags are
complete, but those describe how to render a link preview, not what a page *is*
or who wrote it. Authorship is left to be inferred from prose.

JSON-LD is a `<script type="application/ld+json">` block in `<head>` carrying
schema.org vocabulary. It renders nothing and is read by machines. Google
[recommends JSON-LD](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
over microdata or RDFa.

Worth doing here because the site already optimises the *format* machines
receive — Markdown twins, `/llms.txt`, edge content negotiation. Structured
data is the *meaning* layer, and it is the piece missing.

**Nothing in the stack can detect its absence.** Lighthouse's `structured-data`
audit has `scoreDisplayMode: "manual"` and `score: null`, so it is never
scored; the site's SEO 100 is silent on it. Any check must be written here.

## What the current specs actually say

Checked against Google Search Central and schema.org (V30.0, 2026-03-19) on
2026-09-14. Several of these contradict the obvious first guess.

- **There are no required properties.** Google: "There are no required
  properties; instead, add the properties that apply to your content." So this
  is not a checklist to satisfy — each property either describes the page
  truthfully or is omitted.
- **Markup must match visible content.** Google: "Don't mark up content that is
  not visible to readers of the page." This is the binding constraint here —
  see the byline problem below.
- **Dates need an explicit timezone.** Google: "Google will default to
  Googlebot's timezone if timezone information isn't provided." `isoDate()` in
  `src/utils/formatDate.ts` currently emits `2026-09-03`, date-only, so
  Googlebot would supply its own timezone. Needs a full ISO 8601 value with an
  explicit offset.
- **`author.name` takes the name and nothing else.** Google: "In the
  author.name property, only specify the name of the author. Don't add any
  other piece of information." No job title, no honorific, no "posted by".
  `CONTACT.role` therefore belongs in `jobTitle`, never in `name`.
- **An internal author page should be `ProfilePage`.** Google recommends that
  when `author.url` points at your own profile page, that page is marked up
  with ProfilePage structured data. Its `mainEntity` is the `Person`. Blog
  "About Me" pages are named as a valid use.
- **`WebSite` no longer buys a rich result.** The sitelinks search box was
  deprecated on 2024-11-21. `WebSite` remains valid for site identification and
  unsupported markup causes no errors, but do not add `potentialAction` /
  `SearchAction` expecting a search box — it produces nothing.
- **`BlogPosting` is not right for every entry.** The hierarchy is
  Thing > CreativeWork > Article > SocialMediaPosting > BlogPosting. Entries
  carry `kind: "blog" | "project"`; a project page is not a blog posting.
  Use `BlogPosting` for `kind: blog` and `Article` for `kind: project`.
- **`sameAs` and `author.url` are both understood** for author disambiguation.
  `author.url` should be "a link to a web page that uniquely identifies the
  author".
- **Images** in markup must be crawlable and indexable, relevant to the
  article rather than a logo, and ideally at least 50K pixels.
- **`headline`** should be concise; long titles get truncated.
- **`@id`** links entities across separate blocks, so the `Person` on an entry
  and the `Person` on `/about` resolve to one entity rather than two.

## The byline problem — decide this first

Google forbids marking up what a reader cannot see. On an entry page today,
"Jon Green" appears exactly twice in visible text: the site header brand link,
and the contact block in the footer. **There is no byline on the article
itself** — `ArticleLayout.astro` renders the title, then "Published on
{date}", then the hero image.

Two options:

1. **Add a visible byline** to `ArticleLayout` ("Jon Green • Published on …").
   Puts the markup on firm ground and helps human readers too. Preferred.
2. **Rely on the footer**, which does name Jon Green with role and contact
   details on every page. Defensible, since the name is in the body, but it is
   site attribution rather than an article byline.

Option 1 changes rendered output, which is why this is a decision rather than
an implementation detail.

## Acceptance Criteria

- [x] Decide the byline question above; if option 1, the visible byline ships
      in the same change as the markup
- [x] `BlogPosting` for `kind: blog`, `Article` for `kind: project`, built from
      existing frontmatter: `headline`, `description`, `datePublished`,
      `dateModified` only when `updatedDate` is set, `image` from `heroImage`
      as an absolute URL, `keywords` from `tags`, `mainEntityOfPage`
- [x] `author` as a nested `Person` with `name` (name only), `url` pointing at
      `/about`, `jobTitle` from `CONTACT.role`, and `sameAs` listing the GitHub
      and LinkedIn profiles — all sourced from `src/utils/contact.ts` so
      identity stays in one place
- [x] A stable `@id` for the author so the entry and `/about` resolve to one
      entity
- [x] `/about` marked up as `ProfilePage` with `mainEntity` set to that same
      `Person`
- [x] `WebSite` on the homepage for identification only, with no
      `potentialAction`
- [x] A new date helper emitting full ISO 8601 with an explicit UTC offset,
      unit-tested against a non-UTC `TZ`, since date-only values let Googlebot
      choose the timezone
- [x] Draft entries emit no structured data, as with listings and the sitemap
- [x] Logic in a plain module under `src/utils/` with unit tests; `.astro`
      cannot be unit-tested, so the component stays a thin wrapper
- [x] Build-integration assertions: exactly one `application/ld+json` block per
      entry page, it parses as JSON, `datePublished` matches frontmatter and
      carries a timezone, `@type` matches `kind`, and no literal `undefined`
      or empty `sameAs` reaches the output
- [x] Every URL in the markup is absolute
- [x] Validated against the schema.org vocabulary — done two ways, see the log
- [ ] Validated with Google's Rich Results Test — BLOCKED, needs a signed-in
      Google account. Two minutes in a browser: open
      https://search.google.com/test/rich-results, paste
      `https://jgreen.one/entries/this-site/`, and confirm it parses. Expect
      "no items detected" or eligibility with no enhancements — Google dropped
      most Article rich results for non-news sites, so that is a pass, not a
      failure. The more useful signal afterwards is Search Console's
      "Unparsable structured data" report, which flags real syntax errors on
      pages Google has actually crawled.

## Notes

Filed rather than built because `sameAs` is an identity claim — it tells search
engines which accounts belong to Jon — and the profile list wants a look before
it ships.

`src/utils/seoMeta.ts` and `src/components/SEO.astro` already centralise head
metadata and are the natural home for this. `src/utils/contact.ts` is already
the single source of identity and should stay so.

Optional, not required: `BreadcrumbList`, which is still a supported Google
rich result, unlike the sitelinks search box.

Sources checked 2026-09-14: Google Article structured data and its author best
practices, Google ProfilePage structured data, Google structured data general
policies, the Search Central post "Farewell, Sitelinks Search Box"
(2024-10-21), and schema.org V30.0.

## Log

- 2026-09-14 Created. Found while evaluating third-party crawling and metadata
  tooling: a live check showed zero `application/ld+json` blocks on both the
  homepage and an article, and `grep -rl "ld+json\|schema.org" src/` matched
  nothing.
- 2026-09-14 Rewritten against the current specs. Six corrections to the first
  draft: dates need an explicit timezone and `isoDate()` does not provide one;
  `author.name` must exclude the role; `/about` wants `ProfilePage` rather than
  a bare `Person`; `WebSite` no longer yields a rich result; project entries are
  `Article` not `BlogPosting`; and the visible-content rule makes the missing
  byline a blocking decision rather than a detail.
- 2026-09-14 Implemented and verified locally; not deployed. `isoDateTime()`
  added to `src/utils/formatDate.ts`; `src/utils/structuredData.ts` builds the
  nodes; `SEO.astro` renders the block with `is:inline` and unicode-escaped
  angle brackets so a `</script>` in a value cannot close it early. Wired
  through `PageLayout` and `ArticleLayout`; the entry route builds the node
  because the canonical URL needs `entry.id`, which `entry.data` lacks.
  36 unit tests for the builder, 8 for `isoDateTime`, 11 build-integration
  assertions. All six entries carry the right type: `Article` for the two
  projects, `BlogPosting` for the four posts. Every document expands cleanly
  under JSON-LD 1.1 against schema.org with every property mapping to a real
  IRI (8 on entries, 3 on the homepage, 1 on /about). Remaining: validation
  with Google's Rich Results Test, which needs a published URL.
- 2026-09-16 Validation done as far as it can be without a Google account.

  **Against the schema.org vocabulary, two independent ways, both clean.**

  1. JSON-LD expansion against PRODUCTION, using the reference implementation
     (jsonld 9). Eleven live URLs fetched; six carry a block. Every declared
     property mapped to a real schema.org IRI, nothing dropped:
     `/` WebSite 3/3, `/about/` ProfilePage 1/1, and four entries at 8/8 each.
     The property count is the signal rather than the absence of an error,
     because expansion silently drops terms it cannot resolve — a typo would
     lower the count rather than raise an exception. The five listing pages
     correctly carry no block.
  2. validator.schema.org, driven in a real browser via Playwright. Three pages
     returned **0 ERRORS, 0 WARNINGS**, covering all three node types:
     `/` (WebSite), `/about/` (ProfilePage + Person) and `/entries/this-site/`
     (Article + Person). Google then IP-blocked further automated requests
     ("Our systems have detected unusual traffic from your computer network"),
     so the remaining entries were not re-checked there — they are generated by
     the same code path and were covered by the expansion check above.

  **Google's Rich Results Test could not be completed.** It requires a signed-in
  Google account. The URL flow returns "Something went wrong. Log in and try
  again"; the CODE flow accepts a pasted snippet and the submit button clicks,
  but no result renders while signed out. This is the one criterion that needs
  Jon rather than more work.

  Worth knowing when it is run: the homepage's WebSite node references the
  author by `@id` alone, so a validator reading that document in isolation
  reports the author as `Thing` rather than `Person`. That is correct JSON-LD —
  a node reference, resolved by the `Person` on `/about/` carrying the same
  `@id` — and not a defect.

  **Unrelated find, fixed:** `node_modules/playwright` was left incomplete by a
  deploy's `npm ci` — only `lib/`, no entry point — which broke both the
  browser automation and anything resolving Chrome through it. `npm ci` again
  repaired it. Worth remembering that an interrupted install can leave a
  package half-present rather than absent, which fails in confusing ways.
