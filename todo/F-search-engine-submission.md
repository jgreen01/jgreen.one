# Submit the site to search engines

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-09-19
**Updated**: 2026-09-19

## Description

The site is live, crawled, and **not yet indexed** anywhere. Until it is in an
index, it is invisible to search and — more importantly for this site's whole
thesis — invisible to the AI assistants that retrieve from those indexes.

This task works through **every** submission channel, including the ones not
worth doing, so the decision to skip them is recorded rather than re-litigated
later.

### Why this surfaced

Chasing Gemini's `URL_FETCH_STATUS_GOOGLE_EXTENDED_OPT_OUT` (2026-09-19) ended
in a finding that reframes the problem. From Google's own crawler docs:

> "Google-Extended doesn't have a separate HTTP request user agent string.
> Crawling is done with existing Google user agent strings; the robots.txt
> user-agent token is used in a control capacity."

Google-Extended is a **policy flag evaluated inside Google**, not a crawler.
No robots.txt, WAF, header or meta-tag change can affect it, because no request
reaches the edge. Gemini gates reachability behind Google's *index*, so the only
lever is getting indexed.

That generalises: **for Gemini and ChatGPT, reachability is an indexing problem,
not a serving problem.** The direct crawlers (ClaudeBot, GPTBot, PerplexityBot)
are a separate, already-working path.

## Current state (audited 2026-09-19)

**Verified healthy:**

- All **36** sitemap URLs return **200** — no 404s, no redirect chains
- All **36** page titles are **unique** (tag pages included)
- No `noindex` anywhere in `dist/`
- Canonicals self-referential and correct across `/`, `/about/`, `/blog/`,
  `/entries/this-site/`, `/tags/` — the old "everything canonicalises to the
  homepage" bug is fixed and confirmed live
- No-slash URLs (`/about`) return 200 rather than 301, but serve a canonical
  pointing at the slashed form, so the duplicate URL shape is correctly
  resolved. A 301 would be tidier and save crawl budget; the canonical is the
  accepted mitigation and it is doing its job.
- `robots.txt` 200, allows everything, sitemap declared
- Zero Google user agents blocked across 400 WAF log events
- No Bing, IndexNow or Yandex setup exists in the repo

**Caveat on expectations:** 22 of the 36 sitemap URLs are `/tags/*` pages
against only 6 articles. Tag pages with one entry are what Google declines to
index as thin content. Judge success by whether the **articles** index — not by
sitemap coverage, which will never reach 100%.

---

## Group 0 — Fix before judging the indexing results

Three real findings from the audit. None is catastrophic, and none explains
"not indexed yet" on its own — a new domain simply takes time. But the second
materially reinforces the thin-content signal on exactly the pages already at
risk, so fix it before concluding anything from Search Console.

### 0a. 27 of 36 pages share one meta description ⚠️ *the one that matters*

Every tag page, every listing page (`/blog/`, `/projects/`, `/entries/`,
`/tags/`) and the homepage all emit the site-wide default:

> "Personal site of Jon Green: senior software developer & MCS-DS student…"

Only the 6 articles, the transcript, `/about/` and `/contact/` have their own.

Google usually rewrites meta descriptions and rarely treats them as a ranking
factor, so this is **not** fatal on its own. It matters here because it stacks
on top of the thin-tag-page problem: 22 near-empty pages that also describe
themselves identically look like near-duplicates of one another.

- [ ] Give tag pages a generated description, e.g.
      "Entries tagged *astro* — N posts on jgreen.one."
- [ ] Give each listing page its own
- [ ] Per the TDD rule, this belongs in a `src/utils/` helper with unit tests,
      not in `.astro` frontmatter

### 0b. No `Vary: Accept` on content-negotiated responses

The same URL returns HTML or Markdown depending on the `Accept` request header,
but **no response declares `Vary: Accept`**.

**The cache is safe** — verified empirically, not assumed. The viewer-request
function rewrites the URI *before* the cache lookup, so the two variants occupy
different cache keys (`/entries/x/` vs `/entries/x/index.md`). After the
Markdown variant was cached, a browser-style `Accept` still returned HTML from
cache.

**The gap is downstream.** Browsers, corporate proxies and any intermediary
cache see one URL serving two different bodies with no signal that the
representation depends on a request header. RFC 9110 §12.5.5 says a server
SHOULD send `Vary` when representation selection depends on anything beyond
method and target.

**Googlebot risk: low.** Googlebot's `Accept` does not contain `text/markdown`,
so it always receives HTML. This is a correctness fix, not an indexing rescue.

- [ ] Add `Vary: Accept` in `infra/live/response-function.js`
- [ ] Runtime-gate it with `aws cloudfront test-function` like the other edge changes

### 0c. Markdown twins are directly fetchable and indexable

`https://jgreen.one/entries/this-site/index.md` returns **200 text/markdown**
directly, and `robots.txt` allows everything.

They are not in the sitemap and not linked by any `<a href>`, so discovery is
unlikely — the only pointer is the `Link: rel="alternate"` header. But if Google
does find them, they are duplicate content competing with the HTML.

🟡 Low probability, cheap insurance. `noindex` does **not** block fetching, so
AI crawlers keep full access and the site's thesis is untouched.

- [ ] Consider `X-Robots-Tag: noindex` on `.md` responses in the viewer-response
      function — or consciously decide the risk is too small to bother

### 0d. Minor

- [ ] `/about/` and `/contact/` are the only sitemap URLs with no `lastmod`
      (static pages, no date in frontmatter). Harmless; `lastmod` is only a hint.

---

## Group 1 — Recommended

### 1a. Google Search Console (in progress)

The property is verified. Remaining:

- [ ] Submit `https://jgreen.one/sitemap-index.xml` under **Sitemaps**
- [ ] **URL Inspection → Request indexing** on `/` and 2–3 articles.
      Quota is **10–12 URLs/day per property**, unpublished by Google and
      varying with account history and site size. Spend it on articles, never
      on tag pages. (The Search Console *API* allows 2,000 inspections/day, but
      inspection is not submission — it does not queue a URL for indexing.)
- [ ] Record the robots.txt report's *last fetched* timestamp
- [ ] **Run Google's [Rich Results Test](https://search.google.com/test/rich-results)**
      on `/entries/this-site/` and `/about/`. Inherited from task A, whose
      implementation is complete and validated two other ways — this is the one
      check that needs a signed-in Google account, so it belongs with the rest of
      the browser work rather than blocking a finished task.

      Worth knowing it now covers more than when task A was written: task H added
      `BreadcrumbList`, so an entry page carries **both** `Article` and the
      breadcrumb trail in one `@graph`. One test validates both. Listing pages
      carry `CollectionPage`, which Google parses but renders no rich result for
      — an empty result there is expected, not a failure.
- [ ] Check **Page indexing** and note the exact reason string per URL

The reason string matters — these mean different things:

| Reason | Meaning |
|---|---|
| `Discovered – currently not indexed` | Known but not crawled; crawl priority |
| `Crawled – currently not indexed` | Crawled, Google declined; quality/new-site latency |
| `Duplicate, Google chose different canonical` | Would be the fingerprint of the old canonical bug — needs re-crawl |

If the third appears, the fix already shipped; it needs a re-crawl and a
validation request, not a code change.

### 1b. Bing Webmaster Tools — the highest value-per-minute item

**Why it matters more than its search share suggests:** Bing's index powers
**ChatGPT Search** and **Microsoft Copilot**, and is a major source for
**Perplexity**. It is the same lever as Google indexing applied to a second
family of assistants.

Verification is near-free — Bing imports directly from Google Search Console,
carrying ownership verification *and* sitemaps.

- [ ] Sign in at <https://www.bing.com/webmasters> → **Import from Google
      Search Console** → grant access → auto-verified in minutes

🟡 The import flow is documented by Bing and described in current third-party
2026 guides, but Bing's own help page is a JS app that could not be read
directly on 2026-09-19. If the import option is not in the UI, fall back to
DNS TXT or meta-tag verification — the end state is identical.
- [ ] Confirm the sitemap came across; submit manually if not
- [ ] Use **URL Submission** for `/` and the articles

⚠️ Bing re-validates ownership by periodically syncing with GSC. If Google
access is ever revoked, ownership lapses — so **also add the DNS TXT or meta
verification** as a standing fallback. That is a one-line addition to
`infra/live/dns.tf`, alongside the existing `google-site-verification` and
`protonmail-verification` records, and `tests/infra/test_dns.py` already has a
`test_no_orphaned_verification_tokens` guard whose `known_current` tuple would
need the new prefix added.

---

## Group 2 — Optional, decide on merit

### 2a. IndexNow

A push protocol: ping once, and participating engines share the submission
between them. **Google has publicly declined to join** and still does not
support it as of 2026, so this buys nothing for Gemini.

**Participants:** Bing, Yandex, Naver, Seznam, Yep.

**The honest case for:** it reaches Bing's index — and therefore ChatGPT Search,
Copilot and Perplexity — within minutes rather than waiting for a crawl.

**The honest case against:** value scales with publishing frequency, and this
site ships a handful of articles a year. A sitemap `lastmod` already tells Bing
what changed. This is a nice-to-have.

Implementation (from <https://www.indexnow.org/documentation>, read 2026-09-19):

- **Key**: 8–128 characters, `a-z A-Z 0-9 -`
- **Key file**: UTF-8 text file at `public/<key>.txt` containing only the key.
  A key file's location scopes which URLs it can validate, so root is correct.
- **Batch endpoint**: `POST /indexnow`, up to **10,000 URLs** per request

```json
{
  "host": "jgreen.one",
  "key": "<key>",
  "keyLocation": "https://jgreen.one/<key>.txt",
  "urlList": ["https://jgreen.one/entries/example/"]
}
```

- **Responses**: `200` OK · `202` accepted, key validation pending ·
  `400` bad format · `403` key invalid/not found · `422` URL/host mismatch ·
  `429` rate limited

Notes if this is built:
- The key is **not a secret** — it is published at a public URL by design. It
  still does not belong hardcoded in the repo; read it from the environment or
  a Terraform output, consistent with existing practice.
- Natural home is a step in `scripts/deploy.sh`, submitting the URLs whose
  `lastmod` changed rather than all 36 every deploy.
- Per the TDD rules: the submitter is a shell-out, so mock it, assert exact
  arguments, and assert no key is echoed into build output or logs.

- [ ] Decide yes/no
- [ ] If yes: generate key, add key file, add deploy step + tests

### 2b. Yandex Webmaster

Independent index, supports IndexNow. Real value only for Russian-language
traffic, which is not this audience. Listed for completeness.

- [ ] Decide — recommend no

---

## Group 3 — Low value, with reasons recorded

### 3a. Baidu

Effectively requires Chinese hosting and an ICP licence. The site is on
CloudFront PriceClass_100 and the audience is not in China. **No.**

### 3b. DuckDuckGo

No submission process exists. Its main index is Bing's, so **1b covers it
entirely**. Nothing to do — and nothing *can* be done directly.

### 3c. Brave Search, Marginalia, Mojeek, Kagi — **partly reclassified**

❗ The original draft of this task called these "no submission process, skip."
**That was wrong for two of them.** Verified 2026-09-19:

| Engine | Submission | Verdict |
|---|---|---|
| **Brave Search** | Public form: <https://search.brave.com/submit-url> | **Do it** — two minutes, independent index, powers Brave + feeds Kagi |
| **Marginalia** | PR adding the domain to `sites.txt` in [MarginaliaSearch/submit-site-to-marginalia-search](https://github.com/MarginaliaSearch/submit-site-to-marginalia-search), or email `contact@marginalia-search.com` | **Do it** — a hand-built site on an obscure domain is precisely its editorial target |
| **Mojeek** | Unclear. Only guidance is a 2015 blog post; its own community forum has open threads from 2025 asking whether any current method exists. | Low value — try the forum or skip |
| **Kagi** | No direct submission. Aggregates Brave, Mojeek and Yandex plus its own Teclis index. | Nothing to do — **Brave submission reaches it indirectly** |

These will not move traffic. Brave and Marginalia are worth the four combined
minutes because they are genuinely independent indexes, and Brave propagates
into Kagi.

- [ ] Submit to Brave
- [ ] Submit to Marginalia (PR or email)
- [ ] Check the Mojeek forum, or decide to skip

### 3d. The AI crawlers themselves

ClaudeBot, GPTBot, PerplexityBot, Amazonbot and the rest have **no index and no
submission process**. They fetch live, on demand. The crawler harness already
proves they get 200s.

**Nothing to do here, and nothing that can be done.** Recorded so it is not
re-investigated.

---

## Acceptance Criteria

**Group 0 — site fixes**
- [ ] Tag and listing pages emit their own meta descriptions (helper + unit tests)
- [ ] `Vary: Accept` added to the viewer-response function and runtime-gated
- [ ] `X-Robots-Tag: noindex` on `.md` twins, **or** a recorded decision to skip

**Group 1 — the ones that matter**
- [ ] Sitemap submitted in Google Search Console
- [ ] Indexing requested for `/` and the articles
- [ ] Page-indexing reason strings recorded per URL
- [ ] Bing Webmaster Tools verified, sitemap present, URLs submitted
- [ ] Bing fallback verification in `infra/live/dns.tf` + `test_dns.py` updated,
      **or** an explicit decision not to

**Groups 2–3 — decisions recorded**
- [ ] IndexNow decided yes/no, reasoning written here
- [ ] Yandex, Baidu, DuckDuckGo decisions recorded
- [ ] Submitted to Brave and Marginalia; Mojeek checked or skipped

**Outcome**
- [ ] GitHub repo `homepage` + `description` fields set
- [ ] At least one article confirmed indexed in Google **and** Bing

## Notes

New-domain indexing takes days to weeks; there is no trick that bypasses it.
The largest real accelerant is **inbound links from already-indexed pages**,
which no amount of on-site configuration substitutes for.

Verified 2026-09-19: the README's links to `jgreen.one` do carry
`rel="nofollow"`, so they pass little ranking signal — but Google has treated
nofollow as a *hint* rather than a directive since 2019, so they still aid
discovery. More usefully, the repo's **`homepage` and `description` fields are
both empty**. Setting them is free and gives the site one more crawlable
reference from an already well-indexed domain.

Do not change `robots.txt` for any of this. It is correct, and it is not the
lever.

Full diagnostic record: `~/.session-notes/2026-09-19-jgreen-one-gemini-google-extended-optout.md`

### Sources (read 2026-09-19)

- [Google's common crawlers](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers) — the Google-Extended quote
- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — indexing as prerequisite
- [Gemini URL context tool](https://ai.google.dev/gemini-api/docs/url-context) — index-cache-first retrieval
- [IndexNow documentation](https://www.indexnow.org/documentation)
- [Bing: import from Search Console](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools)
- [Brave Search submit URL](https://search.brave.com/submit-url)
- [Marginalia submission repo](https://github.com/MarginaliaSearch/submit-site-to-marginalia-search)
- [Search Console URL Inspection](https://support.google.com/webmasters/answer/9012289) — quota context
- RFC 9110 §12.5.5 — `Vary` requirement for content negotiation

## Log

- [2026-09-19] Created, following the Google-Extended diagnosis. Current state
  verified live: sitemap 36 URLs, canonicals correct, no noindex, no existing
  Bing/IndexNow setup.
- [2026-09-19] Full indexing audit + fact-check of every instruction above.
  **Corrections:** Brave and Marginalia *do* have submission routes — the first
  draft wrongly filed them as "no process, skip". Request-indexing quota pinned
  at 10–12/day (unpublished). **New findings:** 27/36 pages share one meta
  description; no `Vary: Accept` on negotiated responses (cache verified safe,
  downstream gap real); `.md` twins fetchable and indexable; repo `homepage`
  field empty. **Confirmed clean:** 36/36 URLs return 200, 36/36 titles unique,
  no `noindex`, canonicals correct, no-slash duplicates properly canonicalised.
