# Redirect www to the apex

**Priority**: LOW — a real optimisation, not a bug fix. See "Is this worth doing".
**Status**: DONE — shipped and verified live 2026-09-20
**Created**: 2026-09-20
**Updated**: 2026-09-20

## Description

`www.jgreen.one` serves the full site with **HTTP 200 and no redirect**. Google
is crawling and indexing the site under two hostnames, which splits crawl budget
on a domain that is currently fighting to get crawled at all.

Send `www` to the apex with a 301 so only one hostname ever serves content.

## Where this came from

Google Search Console exports, 2026-09-20 (Coverage + Performance on Search).

**Coverage, as of 2026-09-17:** 13 indexed, 37 not indexed. Critical issues:

| Reason | Source | Pages |
|---|---|---:|
| Discovered – currently not indexed | Google systems | 30 |
| Alternate page with proper canonical tag | Website | 3 |
| Page with redirect | Website | 2 |
| Crawled – currently not indexed | Google systems | 2 |

The middle two rows are the www duplicates.

**Performance, last 3 months** — 1 click, 20 impressions. The top pages show both
hostnames indexed side by side:

```
https://www.jgreen.one/entries/serving-markdown-to-ai-agents   13 impressions, 1 click
https://www.jgreen.one/about                                    2
https://jgreen.one/                                             2
https://jgreen.one/entries/this-site/                           1
https://jgreen.one/entries/serving-markdown-to-ai-agents/       1
https://www.jgreen.one/entries/this-site                        1
```

The single best-performing page, and the only click the site has had, is a **www**
URL.

🟡 Also unexplained, and worth checking while here: 13 + 37 = **50 known URLs**
against a 36-URL sitemap. The extra ~14 are probably the www duplicates plus the
`.md` twins — see task F item 0c, which flags the Markdown twins as directly
fetchable and indexable. The per-URL export in Search Console would settle it;
these CSVs cannot.

## Current state (verified 2026-09-20)

Everything needed is already provisioned. **Nothing new to create.**

- `certificate.tf:6` — `subject_alternative_names = ["www.${var.domain}"]`
- `cloudfront.tf:42` — `aliases = [var.domain, "www.${var.domain}"]`
- `dns.tf:27` — `aws_route53_record.www`, a CNAME to the distribution
- The site's CloudFront distribution has both aliases live
- A **viewer-request function is already attached**:
  `arn:aws:cloudfront::<account-id>:function/subdirectory-index-rewrite`
  (= `infra/live/function.js`, 48 lines), plus a viewer-response function
  `markdown-twin-headers`

Confirmed live:

```
$ curl -s -o /dev/null -w "%{http_code} [%{redirect_url}]\n" https://www.jgreen.one/
200 []
$ curl -s https://www.jgreen.one/about | grep canonical
<link rel="canonical" href="https://jgreen.one/about/">
```

So the canonical is already correct — Google reports "Alternate page with proper
canonical tag" rather than an error because it **found the duplicate and honoured
the preference**. Nothing is being wrongly indexed today.

## Approach

Add a Host check at the very top of `handler()` in `infra/live/function.js`,
before the Markdown negotiation and the clean-URL rewrite, returning a 301.

Sketch — **ES5.1 syntax only** (no `const`/`let`, arrows or template literals;
those fail at parse time and take every request down):

```js
var hostHeader = request.headers && request.headers['host'];
var host = hostHeader && hostHeader.value ? hostHeader.value.toLowerCase() : '';
if (host.indexOf('www.') === 0) {
    return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
            'location': { value: 'https://jgreen.one' + request.uri },
            'cache-control': { value: 'max-age=3600' }
        }
    };
}
```

### The fiddly part: query strings

`request.querystring` is an **object**, not a string, so the redirect must
rebuild it or silently drop it. Dropping it would break any inbound link
carrying UTM parameters. Rebuild it, and unit-test the empty, single and
multi-value cases.

### Why a redirect rather than leaving the canonical to do the work

A canonical expresses a preference; a 301 leaves exactly one hostname. Google is
honouring the canonical, so this is about not spending two crawls where one will
do — see "Is this worth doing".

## Safety

### Cache poisoning is NOT a risk here — verified, not assumed

This site lost ~40 minutes to a cached error response once (a WAF 403 that got
cached by path), so the question was checked directly rather than reasoned from
memory. [AWS documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-generating-http-responses.html):

> "When a function is triggered by a **viewer request** event, CloudFront
> returns the response to the viewer and **doesn't cache it**."

A viewer-request function runs on every request, before the cache lookup, and a
response it generates is returned directly and never stored. That is the
opposite of the earlier incident, where the response came from the origin/WAF
layer and was cacheable. **Do not move this logic to origin-request**, where
generated responses *are* cached.

### ⚠️ The risk that IS real: blast radius

`infra/live/function.js` runs on **every request to the site**. Its own header
comment states the consequence:

> "An unhandled exception here returns HTTP 503 for that request, so a bug is a
> full outage rather than a degraded feature."

A wrong Host comparison, or a redirect that loops, takes the whole site down —
not one page. This is why the change is small in lines but should not be treated
as a five-minute edit.

Specific traps:

- **Redirect loop.** The target must be the apex. If the Host check ever matches
  the apex too, every request loops until the browser gives up.
- `host.indexOf('www.') === 0` matches only a leading `www.`. A naive
  `indexOf('www') !== -1` would match a path or a hostname containing "www"
  anywhere — do not use it.
- Guard every property access, as the rest of the file does. A missing `host`
  header must not throw.

## Testing

**Unit** (`tests/unit/cloudfrontFunction.test.ts`, already 212 lines):
- `www.jgreen.one` → 301 with an absolute apex `location`
- apex → **not** redirected, falls through to existing behaviour (the loop guard)
- query string preserved: none, one param, several
- missing/empty Host header does not throw
- the redirect happens **before** Markdown negotiation, so an agent sending
  `Accept: text/markdown` to a www URL is redirected rather than served the twin
- uppercase `WWW.` in the Host header still matches

**Runtime gate** (`scripts/test-cloudfront-function.sh`) — ⚠️ **the most
involved piece.** Its fixtures currently carry **no Host header at all**, so new
event fixtures are needed. This gate runs the function in AWS's real engine via
`aws cloudfront test-function` and is what catches an ES5.1 syntax error that
Node would happily accept. Do not skip it.

**Infra** (`pytest tests/infra`) — after applying, assert `www` still resolves
and now answers 301 to the apex.

**Manual, after deploy:**
```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.jgreen.one/about
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "https://www.jgreen.one/blog/?utm_source=x"
curl -s -o /dev/null -w "%{http_code}\n" https://jgreen.one/about/   # must stay 200, not loop
```

## Deployment

The function is managed by Terraform, so this needs `terraform plan` reviewed and
then `terraform apply` in `infra/live` — **show the plan before applying**, per
AGENTS.md. `scripts/deploy.sh` runs the runtime gate but does not publish the
function.

## Is this worth doing

**Honestly: it is an optimisation, not a fix.** Google already resolves the
duplicate correctly via the canonical, and nothing is wrongly indexed. What it
buys is one crawl per URL instead of two — which matters more than usual right
now, with **30 pages sitting in "Discovered – currently not indexed"** on a
six-article domain.

**Do task F's Search Console submissions first.** They are free, carry no outage
risk, and move the same needle harder. This change edits the one file where a
mistake is a total outage, so it should not be the first lever pulled.

Counter-argument worth recording: the site's only click so far came through a www
URL. Redirecting is still correct — the 301 passes the signal to the apex — but
it is a reminder that www is not a hypothetical hostname here; real traffic uses
it.

## Acceptance Criteria

- [x] Host check added to `infra/live/function.js` in ES5.1 syntax, guarded
- [x] Query strings preserved through the redirect, `multiValue` included
- [x] Apex requests provably unaffected — verified in the real runtime and live
- [x] Unit tests cover www, apex, query strings, missing Host, uppercase Host,
      and ordering against Markdown negotiation — 14 new cases
- [x] Runtime-gate fixtures extended with Host headers; **38 passed** in the real engine (was 29)
- [x] `terraform plan` reviewed (0 add, 1 change, 0 destroy), then applied
- [x] `pytest tests/infra` asserts the published function — see the caveat in the log
- [x] Verified live: www 301s, apex still 200, query string survives
- [ ] **FOLLOW-UP, not blocking:** re-check Search Console in a few weeks.
      "Alternate page with proper canonical tag" (3 pages) and "Page with
      redirect" (2) should fall away as Google recrawls.

## Notes

Related: task F (search-engine submission) holds the wider indexing picture,
including item 0c on the indexable Markdown twins, which may account for some of
the 50-vs-36 URL gap above.

### Sources (read 2026-09-20)

- [AWS: generating HTTP responses at the edge](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-generating-http-responses.html) — viewer-request responses are not cached
- [CloudFront Functions](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions.html)
- Search Console exports: `jgreen.one-Coverage-2026-09-20.zip`,
  `jgreen.one-Performance-on-Search-2026-09-20.zip`

## Log

- [2026-09-20] Created from the Search Console exports. Verified live that
  `www.jgreen.one` serves 200 with no redirect and a correct apex canonical, that
  the cert SAN, CloudFront alias, Route 53 CNAME and viewer-request function are
  all already in place, and that a viewer-request 301 is not cached by CloudFront.
- [2026-09-20] **DONE.** Implemented, applied and verified in production.

  **Changed:** `infra/live/function.js` (host check at the top of `handler`,
  before Markdown negotiation and the clean-URL rewrite);
  `tests/unit/cloudfrontFunction.test.ts` (+14 cases);
  `scripts/test-cloudfront-function.sh` (host column added to the case table,
  plus handling for a *response*-shaped output — the harness previously only
  read `request.uri`, which a generated 301 does not have);
  `tests/infra/test_aws.py` (+4 assertions on the published function).

  **Verified:**
  - unit **863 passing** (was 849)
  - CloudFront runtime gate **38 passed** in AWS's real engine, was 29. This is
    the one that matters: it proves the ES5.1 syntax parses, which Node cannot.
  - `terraform plan`: 0 to add, **1 to change**, 0 to destroy — the function
    code only.
  - `pytest tests/infra` **64 passed, 1 skipped**
  - `npx astro check` unchanged at the 1 pre-existing error
  - Live: `www.jgreen.one/about` → 301 → `https://jgreen.one/about`;
    `?utm_source=x&b=2` survives; all 8 apex routes return 200 with **zero**
    redirects; the chain from www terminates in exactly one hop.

  **The loop guard held**, which was the real risk. `indexOf('www.') === 0` is
  asserted three ways: a unit test for `wwwx.jgreen.one` and a path containing
  "www", a real-runtime gate case, and an infra test that the *published* code
  contains the anchored form. An unanchored check would have 503'd the site.

  **Caveat, honestly:** `tests/infra` is boto3-only by design — it asserts
  deployed AWS resources, not HTTP. So it verifies the published LIVE function
  carries the anchored redirect, rather than making an HTTP request and seeing a
  301. The live 301 was verified by curl instead, recorded above. Adding an HTTP
  check would mean introducing a new dependency and a new kind of test to that
  suite; it did not seem worth it for a behaviour the runtime gate already
  proves twice.

  **Propagation** took roughly 10 seconds from `terraform apply` to the first
  301 in production.
