# Add JSON-LD structured data

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-09-14
**Updated**: 2026-09-14

## Description

The site emits no structured data at all. Every page carries complete Open
Graph and Twitter Card tags, which describe how to *render a link preview*, but
nothing that states what the page *is* or who wrote it.

JSON-LD is a `<script type="application/ld+json">` block in `<head>` holding
JSON in the schema.org vocabulary, which Google, Bing, Yandex and Apple
maintain jointly. It renders nothing. It is read by machines.

Three things it would buy:

1. **Authorship becomes asserted rather than inferred.** Today an AI agent
   summarising an entry works out the author from prose. With an `author` node
   it is stated. For a portfolio whose purpose is being credited, that is the
   gap worth closing.
2. **Entity resolution via `sameAs`.** Linking the author to the GitHub and
   LinkedIn profiles lets a search engine merge jgreen.one, github.com/jgreen01
   and linkedin.com/in/jgreen01 into one person rather than three unrelated
   pages that share a name.
3. **Eligibility for rich results.** Article structured data is the
   precondition. Without it the site is not penalised, it is simply not a
   candidate.

This fits the site's existing argument. The Markdown twins, `/llms.txt` and
edge content negotiation already optimise the *format* machines receive.
Structured data is the *meaning* layer, and it is the piece missing.

**Nothing in the current stack can catch its absence.** Lighthouse's
`structured-data` audit has `scoreDisplayMode: "manual"` and `score: null`, so
it is never scored — the site's SEO 100 is silent on this. Any check has to be
written here.

## Acceptance Criteria

- [ ] `BlogPosting` on every entry, built from existing frontmatter: `headline`,
      `description`, `datePublished`, `dateModified` when `updatedDate` is set,
      `image` from `heroImage`, `keywords` from `tags`, `mainEntityOfPage`
- [ ] `author` as a nested `Person` node with `name`, `url` and `sameAs`
      pointing at the GitHub and LinkedIn profiles, sourced from
      `src/utils/contact.ts` so identity stays in one place
- [ ] `Person` on `/about`
- [ ] `WebSite` on the homepage
- [ ] Logic lives in a plain module under `src/utils/` with unit tests;
      `.astro` files cannot be unit-tested, so the component stays a wrapper
- [ ] Build-integration assertions that every entry page carries exactly one
      `application/ld+json` block, that it parses as JSON, and that its
      `datePublished` matches the frontmatter
- [ ] No page emits a literal `undefined` or an empty `sameAs`
- [ ] Validated against Google's Rich Results Test before it is called done

## Notes

Decision deferred deliberately: `sameAs` is an identity claim — it tells search
engines which accounts belong to Jon — so the exact profile list wants a look
before it ships.

Dates must use the UTC helpers in `src/utils/formatDate.ts`. A date rendered a
day early for anyone west of Greenwich has already been a bug here once, and
`datePublished` is exactly the kind of field where it would go unnoticed.

Draft entries must not emit structured data, on the same reasoning that keeps
them out of listings and the sitemap.

Worth considering but not required: `BreadcrumbList` for navigation.

Related: `src/utils/seoMeta.ts` and `src/components/SEO.astro` already
centralise head metadata and are the natural home for this.

## Log

- 2026-09-14 Created. Found while evaluating third-party crawling and metadata
  tooling: a live check showed zero `application/ld+json` blocks on both the
  homepage and an article, and `grep -rl "ld+json\|schema.org" src/` matched
  nothing.
