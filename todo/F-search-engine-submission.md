# Submit the site to search engines

**Priority**: MEDIUM
**Status**: IN PROGRESS
**Created**: 2026-09-19
**Updated**: 2026-09-22

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

## Site fixes — ✅ COMPLETE

Done before judging any indexing result, so the pages Google recrawls are the
improved ones. All four are settled; kept for the record.

Three real findings from the audit. None is catastrophic, and none explains
"not indexed yet" on its own — a new domain simply takes time. But the second
materially reinforces the thin-content signal on exactly the pages already at
risk, so fix it before concluding anything from Search Console.

### Descriptions — 27 of 36 pages share one meta description ⚠️ *the one that matters*

Every tag page, every listing page (`/blog/`, `/projects/`, `/entries/`,
`/tags/`) and the homepage all emit the site-wide default:

> "Personal site of Jon Green: senior software developer & MCS-DS student…"

Only the 6 articles, the transcript, `/about/` and `/contact/` have their own.

Google usually rewrites meta descriptions and rarely treats them as a ranking
factor, so this is **not** fatal on its own. It matters here because it stacks
on top of the thin-tag-page problem: 22 near-empty pages that also describe
themselves identically look like near-duplicates of one another.

- [x] Give tag pages a generated description, e.g.
      "Entries tagged *astro* — N posts on jgreen.one."
- [x] Give each listing page its own
- [x] Per the TDD rule, this belongs in a `src/utils/` helper with unit tests,
      not in `.astro` frontmatter

### Vary: Accept — No `Vary: Accept` on content-negotiated responses

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

- [x] Add `Vary: Accept` in `infra/live/response-function.js`
- [x] Runtime-gate it with `aws cloudfront test-function` — gate 38 → 42 passing

### noindex on the twins — Markdown twins are directly fetchable and indexable

`https://jgreen.one/entries/this-site/index.md` returns **200 text/markdown**
directly, and `robots.txt` allows everything.

They are not in the sitemap and not linked by any `<a href>`, so discovery is
unlikely — the only pointer is the `Link: rel="alternate"` header. But if Google
does find them, they are duplicate content competing with the HTML.

🟡 Low probability, cheap insurance. `noindex` does **not** block fetching, so
AI crawlers keep full access and the site's thesis is untouched.

- [x] Consider `X-Robots-Tag: noindex` on `.md` responses in the viewer-response
      function — or consciously decide the risk is too small to bother

### lastmod — ✅ CLOSED — no action, the current behaviour is correct

`/about/` and `/contact/` are the only sitemap URLs with no `lastmod`, because
they carry no date. **This is right, not merely harmless.** Google's sitemap
documentation:

> "If you're not sure whether your metadata is accurate (for example, you don't
> know when a particular URL was last modified), it's better to omit that tag
> for that particular URL than to just make up a value which may be inaccurate."

Google uses `lastmod` only "if it's consistently and verifiably accurate".
Stamping build time on the two undated pages would make every page look freshly
modified on every deploy, and cost the signal on the other 34 to gain nothing on
these two.

The repository already holds this position deliberately:
`tests/integration/build.test.mjs:469` — *"pages that cannot be honestly dated
carry no lastmod"* — asserts both URLs have none. Changing this would mean
deleting a test written to prevent exactly that.

- [x] Verified 2026-09-21 and closed. No change required.

---

## The engines, ordered by usage

Share is worldwide across all devices, [StatCounter](https://gs.statcounter.com/search-engine-market-share),
2026. Ordered by how many people actually use them, which is not the same as the
order to work through — see below.

| # | Engine | Share | Status |
|---|---|---:|---|
| 1 | Google | **91.1%** | ✅ sitemap submitted, indexing requested |
| 2 | **Bing** | 4.5% | ✅ verified by DNS, sitemap submitted |
| 3 | Yahoo | 1.23% | covered by Bing — nothing to do |
| 4 | Yandex | 0.99% | ✅ verified, sitemap queued |
| 5 | DuckDuckGo | 0.89% | covered by Bing — nothing to submit |
| 6 | Baidu | 0.62% | no |

### Why the ranking understates Bing

**Yahoo, DuckDuckGo, Ecosia and AOL all draw their web results from Bing's
index.** One Bing submission therefore reaches roughly **7% of all search**
rather than 4.5% — and the same index is what **ChatGPT Search** and **Microsoft
Copilot** read, and a major source for **Perplexity**.

So after Google, Bing is not merely next on the list; it is next by a wide
margin over everything below it, and it costs one click from Search Console.
Nothing else remaining in this task approaches that ratio of effort to reach.

---

## 1. Google — 91.1%



The property is verified. Remaining:

- [x] Submit `https://jgreen.one/sitemap-index.xml` under **Sitemaps** —
      done 2026-09-21: **Success, 36 pages discovered**
- [x] **URL Inspection → Request indexing** on `/` and 2–3 articles. Done
      2026-09-21.
      Quota is **10–12 URLs/day per property**, unpublished by Google and
      varying with account history and site size. Spend it on articles, never
      on tag pages. (The Search Console *API* allows 2,000 inspections/day, but
      inspection is not submission — it does not queue a URL for indexing.)
- [x] Record the robots.txt report's *last fetched* timestamp — **2026-09-21
      02:55**, `http://jgreen.one/robots.txt`, Fetched, **4,282 bytes**, 28
      warnings. Size matches the live file exactly, so Google holds the current
      version. The `http://` is a **domain property** listing a scheme variant,
      not a misconfiguration: `http://` 301s to `https://`, and a URL-prefix
      `http://` property would have rejected the all-https sitemap that
      submitted successfully.

      The 28 warnings are the 14 `Content-Usage` + 14 `Content-Signal` lines,
      confirmed by count. RFC 9309 requires a parser to ignore records it does
      not recognise, so "Rule ignored by Googlebot" is correct behaviour rather
      than an error — and it also means neither vocabulary does anything for
      Google today. See the open decision in Notes.
- [x] **Run Google's [Rich Results Test](https://search.google.com/test/rich-results)** — done 2026-09-21.
      ⚠️ Outcome not recorded here; see the note below.
      on `/entries/this-site/` and `/about/`. Inherited from task A, whose
      implementation is complete and validated two other ways — this is the one
      check that needs a signed-in Google account, so it belongs with the rest of
      the browser work rather than blocking a finished task.

      Worth knowing it now covers more than when task A was written: task H added
      `BreadcrumbList`, so an entry page carries **both** `Article` and the
      breadcrumb trail in one `@graph`. One test validates both. Listing pages
      carry `CollectionPage`, which Google parses but renders no rich result for
      — an empty result there is expected, not a failure.
- [x] Check **Page indexing** — done 2026-09-21.
      ⚠️ Reason strings not recorded here; see the note below.

⚠️ **Two outputs were not captured, and they were the point of those steps.**
The actions are done; what they produced is not written down. Neither blocks
anything, but both are the only diagnostic information available:

1. **The Page-indexing reason strings.** These distinguish ordinary new-domain
   latency from something fixable — see the table below. Worth a look if the
   count of indexed pages stops climbing.
2. **The Rich Results Test outcome.** Inherited from task A, which closed on the
   basis that this was the last unrun check. If it reported errors on `Article`
   or `BreadcrumbList`, that is a real defect and task A should reopen; a clean
   pass closes the loop properly.

The reason string matters — these mean different things:

| Reason | Meaning |
|---|---|
| `Discovered – currently not indexed` | Known but not crawled; crawl priority |
| `Crawled – currently not indexed` | Crawled, Google declined; quality/new-site latency |
| `Duplicate, Google chose different canonical` | Would be the fingerprint of the old canonical bug — needs re-crawl |

If the third appears, the fix already shipped; it needs a re-crawl and a
validation request, not a code change.

---

## 2. Bing — 4.5% direct, ~7% effective



**Why it matters more than its search share suggests:** Bing's index powers
**ChatGPT Search** and **Microsoft Copilot**, and is a major source for
**Perplexity**. It is the same lever as Google indexing applied to a second
family of assistants.

Verification is near-free — Bing imports directly from Google Search Console,
carrying ownership verification *and* sitemaps.

- [x] **Verification record — done by DNS instead of the Search Console
      import.** A CNAME `<bing-token>.jgreen.one` → `verify.bing.com`, live
      since 2026-09-22. It has been in `infra/live/dns.tf` since task K, and
      `TestSearchEngineVerification` in `tests/infra/test_dns.py` asserts it.
- [x] Verified in Bing Webmaster Tools (Jon, 2026-09-22)
- [x] Submitted `https://jgreen.one/sitemap-index.xml` (Jon, 2026-09-22). DNS
      verification imports nothing from Search Console, so this had to be done
      by hand.
- [ ] Use **URL Submission** for `/` and the articles — ❓ not confirmed

✅ **Choosing DNS also removed the import's one weakness.** Ownership imported
from Search Console is re-validated against Google and lapses if that access is
ever revoked. A DNS record depends on nothing else, so the "standing fallback"
this section used to call for is no longer needed.

---

## 3. Yahoo — 1.23%

Bing-powered, with no index or submission of its own. **Section 2 covers it
entirely.** Recorded so it is not re-investigated.

---

## 4. Yandex — 0.99%



Independent index, supports IndexNow. Real value only for Russian-language
traffic, which is not this audience. Listed for completeness.

- [x] Decide — recommended no; **Jon chose yes** (2026-09-22). Kagi also draws
      on Yandex's index.
- [x] Verification TXT added to the apex TXT in `infra/live/dns.tf` and applied
      (2026-09-22): `0 added, 1 changed, 0 destroyed`, one value added and
      none removed. Live on 8.8.8.8 and 1.1.1.1. The first verification to go
      through Terraform rather than the console.
- [x] Verified in Yandex Webmaster (2026-09-22). Yandex accepts a sitemap only
      for a verified site, so the next item proves it.
- [x] Submitted `https://jgreen.one/sitemap-index.xml` (2026-09-22): "added to
      the processing queue". Processing takes **up to 1–2 weeks**; a Site
      Diagnostics warning about missing processed files clears on its own once
      it is done.

---

## 5. DuckDuckGo — 0.89%



No submission process exists. Its main index is Bing's, so **1b covers it
entirely**. Nothing to do — and nothing *can* be done directly.

Confirmed still true in 2026: DuckDuckGo uses **Bing as the primary source** for
standard web results, supplemented by its own `DuckDuckBot` for instant answers,
link-health checks and structured data, plus several hundred specialist sources.

Verified 2026-09-21 that `DuckDuckBot` fetches the site successfully (200), and
`robots.txt` carries no `Disallow` for it or anyone else. **Doing Bing is doing
DuckDuckGo** — that is the only lever that exists.

---

## 6. Baidu — 0.62%



Effectively requires Chinese hosting and an ICP licence. The site is on
CloudFront PriceClass_100 and the audience is not in China. **No.**

---

## Below the measurement threshold, but cheap and well-aimed



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
- [x] Submitted to Marginalia — PR [#734](https://github.com/MarginaliaSearch/submit-site-to-marginalia-search/pull/734)
      (2026-09-22), adding `jgreen.one` to `sites.txt`. Once merged, the site
      is picked up by the next crawl, which "may be a month or more".
- [ ] Check the Mojeek forum, or decide to skip

---

## Push protocols, not engines



A push protocol: ping once, and participating engines share the submission
between them. **Google has publicly declined to join** and still does not
support it as of 2026, so this buys nothing for Gemini.

**Participants** (per `https://www.indexnow.org/searchengines.json`, checked
2026-09-23): Bing, Yandex, Naver, Seznam, Yep, **Amazon** (endpoint
`indexnow.amazonbot.amazon`) and the **Internet Archive**. The earlier list of
five was out of date.

**Endpoint:** the FAQ (<https://www.indexnow.org/faq>) lists
`https://api.indexnow.org/indexnow` first, as the "IndexNow global endpoint", and
says each endpoint's submissions are "shared across all IndexNow-enabled search
engines". So one POST there reaches all seven. Any engine's own endpoint
(`www.bing.com/indexnow`, say) would do the same.

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

### Decision (2026-09-22): **yes — Jon.** Build it. Work starts 2026-09-23.

I recommended against it: it speeds up discovery of changes rather than
getting a new domain indexed, and pasting URLs in by hand covers a handful of
articles a year. Jon's case is the stronger one for this site. A deploy step
is never forgotten, and one ping reaches every participant together (seven as
of 2026-09-23, including Bing, Yandex and Amazon). It also covers pages nobody would resubmit by hand, such as edited
articles and the tag and listing pages a new post changes. It costs nothing
to run.

- [x] Decide yes/no — **yes** (Jon, 2026-09-22)

### Design (agreed 2026-09-22)

**The key is committed** (Jon chose this over a Terraform `random_id`).

- Store it at `public/indexnow-key.txt`: the key alone, 32 lowercase hex, from
  `openssl rand -hex 16`. It ships as `https://jgreen.one/indexnow-key.txt`.
- The payload names it with `keyLocation`, so the filename need not equal the
  key. A root-level file validates every URL on the host.
- **Why committing is fine.** The identifier rule in AGENTS.md is about IDs a
  provider assigns, which go stale when a resource is recreated. This is a
  value we mint and publish ourselves, so it has no other source of truth and
  cannot go stale.
- This **supersedes the earlier note** that said to keep the key out of the
  repo, as does the rest of this design.
- **No secret-scanner change needed.** Lowercase hex matches none of the
  detectors, and the assigned-secret detector only looks at `name = "value"`.
- **Content-Type is already right.** Deploy step 5 already stamps `.txt` as
  `text/plain; charset=utf-8`. The viewer-request function leaves paths with
  an extension alone, as it does for `robots.txt` and `llms.txt`.

**Which URLs get pinged: only what changed, read off the sitemap.**

- **Checked 2026-09-22:** 34 of 36 URLs carry `lastmod`. Listing pages, tag
  pages and `/` carry the newest entry's date. So a new post changes its own
  URL (new), plus `/`, `/blog/`, `/entries/`, `/projects/` and its tag pages
  (new `lastmod`).
- **Submit:** URLs new in the build, URLs whose `lastmod` changed, and URLs
  that disappeared. IndexNow handles deletions too; engines then see the 404
  sooner.
- **Never pinged:** `/about/` and `/contact/`, which have no `lastmod`. That
  is the same trade-off the sitemap already makes (see "lastmod — CLOSED").
- **The spec asks for changed URLs only.** Resubmitting unchanged ones risks
  being deprioritised, so never send all 36 on every deploy.
- **"Before" is a snapshot of the live sitemap, taken before the sync**
  overwrites it. Fetch `https://jgreen.one/sitemap-index.xml`, then each
  `<sitemap><loc>` (today only `sitemap-0.xml`), and store `url → lastmod`.
  **"After"** is `dist/sitemap-index.xml` and its children.
- **Missing snapshot** (site unreachable, say): skip the ping and warn. Don't
  fall back to submitting everything.
- **First run:** after the first deploy that ships the key file, run
  `submit --all` by hand, once.

**Endpoint:** `POST https://api.indexnow.org/indexnow`.

- It forwards to every participant.
- Body: `{ host, key, keyLocation, urlList }` with
  `Content-Type: application/json; charset=utf-8`.
- At most 10,000 URLs per request (chunk; this site will never come close).
- Responses: 200 OK · 202 accepted, key validation pending (normal on the
  first run) · 400 bad format · 403 key not found or invalid · 422 URL not on
  host · 429 rate-limited.

**A failed ping never fails a deploy.** By then the site has shipped. The
command-line wrapper exits 0 on network and HTTP errors and prints a warning,
and `deploy.sh` also guards with `|| echo "Warning: …" >&2`.

### Files

| File | What |
|---|---|
| `public/indexnow-key.txt` | the key, nothing else |
| `scripts/lib/indexnow.mjs` | **pure, all the logic** (listed below) |
| `scripts/indexnow.mjs` | thin command-line wrapper: `snapshot --out <file>` and `submit --before <file> [--all] [--dry-run]`. Reads `dist/` and `dist/indexnow-key.txt` (the deployed copy, which proves it is in the build), and uses Node 22's global `fetch` |
| `scripts/deploy.sh` | snapshot right before step 4 (`aws s3 sync`); submit after step 6 (the invalidation), so pages and key file are live when engines fetch |
| `tests/unit/indexnow.test.ts` | unit tests for the module |
| `tests/unit/deployScript.test.ts` | ordering and failure tests (listed below) |
| `tests/integration/build.test.mjs` | `dist/indexnow-key.txt` exists and holds a valid key. It belongs here, not in a unit test: unit tests must not read `public/` (AGENTS.md) |
| `tests/fixtures/indexnow_sitemap-index.xml`, `indexnow_sitemap-0.xml` | copied from a real `dist/` build ("recorded fixtures, never arbitrary mocks") |

What `scripts/lib/indexnow.mjs` exports:

- `parseSitemap(xml)` returns a `Map` of url → lastmod, or null when there is
  none. It decodes `&amp;` and friends.
- `sitemapLocs(indexXml)` lists the child sitemaps.
- `changedUrls(before, after)` returns the added, updated and removed URLs.
- `validateKey(key)`: 8–128 characters, `[a-zA-Z0-9-]`.
- `buildPayload({ host, key, keyLocation, urls })` throws on a URL from another
  host, and chunks at 10,000.
- `describeResponse(status)` maps each status to ok or not, plus a message.
- `snapshot({ origin, fetch })` and `submit({ …, fetch })` take `fetch` **as a
  parameter**, so the tests pass a fake and assert the exact request. Nothing
  hits the network in a test.

### Steps (test-first, per AGENTS.md)

1. `tests/unit/indexnow.test.ts` **RED**, then `scripts/lib/indexnow.mjs`
   **GREEN**. Cover:
   - parsing the real fixture: 36 URLs, 34 with `lastmod`;
   - the diff cases: new, changed, removed, unchanged, no `lastmod` either
     side;
   - key validation, the host check, chunking;
   - each response status;
   - `submit` sending the exact method, URL, headers and body to the fake
     `fetch`;
   - `snapshot` on a fetch failure (a warning result, not a throw).
2. `scripts/indexnow.mjs` wrapper. Check it by hand with `--dry-run`, which
   prints the URLs it would send and sends nothing:
   - `submit --before <fresh snapshot> --dry-run` should find **0** changes
     against the live site;
   - `submit --all --dry-run` should list 36.
3. Deploy tests **RED**:
   - add a `writeIndexNowStub(log, snapshotExit, submitExit)` to
     `setupWorkdir`, following the `audit.mjs` stub. Without it, every
     existing deploy test would run the real script.
   - Assert: the snapshot runs before `aws s3 sync`; the submit runs after
     `create-invalidation`; the submit's `--before` is the snapshot's
     `--out`.
   - Assert that a failing snapshot, and separately a failing submit, still
     end in `Deployment complete.` with exit 0.
   - Assert no AWS credential appears in either call.
   - Then `deploy.sh` **GREEN**.
4. Generate the key and add `public/indexnow-key.txt`, plus the
   build-integration assertion.
5. Verify:
   - `npm test`; `npm run test:build`; `npm run check:secrets`;
   - `npx astro check`: only the existing `tests/unit/audit.test.ts:148`
     error is expected;
   - `bash -n scripts/deploy.sh`.
6. Ship, **when Jon says deploy**:
   - `./scripts/deploy.sh`;
   - confirm `curl -s https://jgreen.one/indexnow-key.txt` returns the key;
   - then, once, `node scripts/indexnow.mjs submit --all` and expect 200 or
     202;
   - record the response here.
7. Later: Bing Webmaster Tools → **IndexNow** shows the received URLs. That
   confirms end to end.

- [x] Steps 1–5: built and tested (2026-09-23). The details are in the Log.
- [ ] Step 6: deployed, key file live, first `--all` submission accepted
- [ ] Step 7: submissions visible in Bing Webmaster Tools

---

## The AI crawlers



ClaudeBot, GPTBot, PerplexityBot, Amazonbot and the rest have **no index and no
submission process**. They fetch live, on demand. The crawler harness already
proves they get 200s.

**Nothing to do here, and nothing that can be done.** Recorded so it is not
re-investigated.

---

## Acceptance Criteria

**Site fixes — complete**
- [x] Tag and listing pages emit their own meta descriptions — 27 duplicates → 0, live
- [x] `Vary: Accept` added to the viewer-response function and runtime-gated — live
- [x] `X-Robots-Tag: noindex` on `.md` twins — done, shipped with task J.
      Applies only to a direct request for the twin's own URL: a *negotiated*
      Markdown response is served at the page's URL, and marking that would tell
      a crawler not to index the article itself. **Live** — verified
      2026-09-22: the twin's URL sends `X-Robots-Tag: noindex`, the HTML page
      does not.

**Google and Bing — where 95% of search actually is**
- [x] Sitemap submitted in Google Search Console — 2026-09-21, 36 pages
- [x] Indexing requested for `/` and the articles — 2026-09-21
- [ ] Page-indexing reason strings recorded per URL
- [ ] Bing Webmaster Tools verified, sitemap present, URLs submitted —
      verified and sitemap done 2026-09-22; URL Submission not confirmed
- [x] Bing fallback verification in `infra/live/dns.tf` + `test_dns.py` — moot:
      DNS *is* the verification, in `dns.tf` since task K and asserted by
      `test_dns.py`

**Everything else — decisions recorded**
- [x] IndexNow decided yes/no, reasoning written here — **yes** (Jon,
      2026-09-22); design and steps in "Push protocols"
- [ ] IndexNow built ✓ (2026-09-23), deployed, and the first submission accepted
- [x] Yandex, Baidu, DuckDuckGo decisions recorded — Yandex yes (verified,
      sitemap queued), Baidu no, DuckDuckGo covered by Bing
- [ ] Submitted to Brave and Marginalia; Mojeek checked or skipped —
      Marginalia PR #734 open

**Outcome**
- [x] GitHub repo `homepage` + `description` fields set — verified 2026-09-22
      with `gh repo view`, plus six topics
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
- [2026-09-21] **Group 0 complete.** 0a (descriptions) and 0b (`Vary: Accept`)
  are live; 0c (`noindex`) is committed with task J and awaits deploy; 0d closed
  as by-design — Google explicitly prefers an omitted `lastmod` to an invented
  one, and a build test already enforces it.

  Jon submitted `sitemap-index.xml` to Search Console: **Success, 36 pages**.

  What is left in this task is browser work and decisions, not code.
- [2026-09-21] Reordered by actual usage rather than by recommendation, at
  Jon's request, with StatCounter 2026 shares.

  The reordering makes one thing explicit that the old grouping buried: **Bing's
  4.5% understates its reach badly.** Yahoo, DuckDuckGo, Ecosia and AOL all read
  Bing's index, so one submission covers roughly 7% of search — and the same
  index is what ChatGPT Search and Copilot read. After Google it is not merely
  next, it is next by a wide margin, for one click.

  DuckDuckGo gained its own section rather than a footnote. Verified 2026-09-21
  that `DuckDuckBot` fetches the site (200) and that `robots.txt` blocks nobody.
  There is still no submission form: doing Bing is doing DuckDuckGo.
- [2026-09-22] **Reconciled against live state**; ticked only what was
  verified or reported.
  - **Verified here:**
    - `noindex` live on the twins' own URLs;
    - repo homepage, description and topics set;
    - Bing's DNS record live and in Terraform (task K);
    - Yandex's TXT live.
  - **Reported by Jon:**
    - the Google sitemap and indexing requests (2026-09-21);
    - the Yandex sitemap queued (2026-09-22), which also proves the site is
      verified there;
    - Bing verified and the sitemap submitted (2026-09-22).
  - **Fixed on the way:** `test_no_orphaned_verification_tokens` only matched
    tokens written `name=value`, so it never saw Yandex's
    `yandex-verification: <code>`. The suite passed because the guard missed
    the token, not because it approved it. Widened the match to `[=:]` (RED on
    the live token), then added Yandex to `known_current` (GREEN).
  - **Still open:**
    - Bing URL Submission (not confirmed);
    - the Page-indexing reason strings;
    - the Rich Results Test outcome;
    - Brave and Mojeek. Marginalia: PR #734 opened 2026-09-22, awaiting merge;
    - IndexNow: decided yes; design written, build starts 2026-09-23;
    - an article confirmed indexed in both Google and Bing.
- [2026-09-23] **IndexNow built, test-first; not deployed.** Steps 1–5 done.
  - `scripts/lib/indexnow.mjs`: 50 unit tests, RED first, against sitemaps
    recorded from a build byte-identical to the live site.
  - `scripts/indexnow.mjs`: the command-line wrapper. Exit codes: 0 when done
    or when the other end failed (with a warning); 1 for a local problem, such
    as no build or a bad key file; 2 for a usage error.
  - `deploy.sh` has two new steps: step 4 records the live sitemap before the
    sync, and step 8 submits after the invalidation. Both are guarded so a
    failure only warns. 9 new deploy tests (7 RED first, 2 guards); the
    credential test covers the new calls automatically.
  - `public/indexnow-key.txt`: 32 hex characters, no trailing newline. A
    build-integration test checks it ships as exactly one valid key.
  - The viewer-request function leaves `/indexnow-key.txt` alone (checked).
  - **Dry runs against the live site:**
    - a fresh snapshot gives 0 changes (build == live);
    - `--all` lists 36 URLs;
    - a hand-altered snapshot gives exactly the 3 URLs altered: a changed
      lastmod, one new in the build, and one gone from it.
  - **Checks:**
    - `npm test` 997 passed; `check:secrets` clean;
    - `astro check`: only the existing `audit.test.ts:148` error;
    - `test:build` 95/96. The one failure was already there and is unrelated:
      `--strict` media-check flags three `public/media/rocket-reliability-*.webp`
      files from 2026-09-02 that are in no manifest and referenced nowhere.
      `deploy.sh` runs media-check without `--strict`, so it does not block a
      deploy, but `aws s3 sync` would upload those files.
  - **One unexplained run:** a single `test:build` run showed 11 failures.
    Two reruns (alone, and after `astro check` as before) showed only the
    media one. That run coincided with the editor's connection dropping.
  - **Next:** step 6, when Jon says deploy: deploy, confirm the key file is
    live, then `node scripts/indexnow.mjs submit --all` once.
