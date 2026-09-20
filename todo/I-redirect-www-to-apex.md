# Redirect www to the apex

**Priority**: LOW — a real optimisation, not a bug fix. See "Is this worth doing".
**Status**: TODO
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
- Distribution `E2G3DB3OD7XU6F` has both aliases live
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

- [ ] Host check added to `infra/live/function.js` in ES5.1 syntax, guarded
- [ ] Query strings preserved through the redirect
- [ ] Apex requests provably unaffected (no loop)
- [ ] Unit tests cover www, apex, query strings, missing Host, uppercase Host,
      and ordering against Markdown negotiation
- [ ] Runtime-gate fixtures extended with Host headers; gate passes in the real engine
- [ ] `terraform plan` reviewed, then applied
- [ ] `pytest tests/infra` asserts the 301
- [ ] Verified live: www 301s, apex still 200, query string survives
- [ ] Re-check Search Console after a few weeks: "Alternate page with proper
      canonical tag" and "Page with redirect" should fall away

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
