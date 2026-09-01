# Serve Markdown to AI agents

**Priority**: LOW
**Status**: TODO
**Created**: 2025-09-28
**Updated**: 2026-08-31

## Description

Publish a Markdown version of each entry so AI agents can read the writing without
paying for the markup around it. Same words, lighter format, same URLs.

Measured on this site's one real post:

| | Bytes | ~Tokens |
|---|---|---|
| Built HTML | 30,010 | ~7,500 |
| Markdown body | 4,972 | ~1,243 |

**83% smaller** — in line with Cloudflare's 80% and Checkly's 99.7% on larger pages. The
ratio holds even on a short article; the absolute saving is ~6,000 tokens per fetch.

## ⛔ What this task is not

The original plan (Sept 2025) proposed detecting AI crawlers by User-Agent and rewriting
their requests to a bulk NDJSON pack. **Withdrawn 2026-08-31.** Two problems:

1. Its User-Agent list contained `googlebot`, `bingbot` and `msnbot`. Implemented as
   written, Google and Bing would have been served a JSON blob instead of the website.
2. Serving different bytes to different agents at one URL is **cloaking** — Google
   penalises it at site level, and AI platforms that notice a mismatch between what they
   fetched and what a human sees drop the domain from answers. Aiming to be read by AI,
   it risked the opposite.

The JSON/NDJSON bulk packs are also gone. Nothing asked for them, and the 2026 research
found no evidence any AI system consumes that shape. If something ever does, the
`media-manifest.json` pattern from task 6 shows how to build one.

**The rule this task keeps:** route on what the client *asks for*, never on who it claims
to be.

## Ecosystem findings (researched 2026-08-31)

**Content negotiation won.** `Accept: text/markdown` on the same URL is the mainstream
approach. Cloudflare shipped *Markdown for Agents* (Feb 2026) doing it at the edge.
Checkly tested which agents actually send the header:

| Sends it | Does not |
|---|---|
| **Claude Code**, **Cursor**, **OpenCode** | Codex, Copilot, Gemini CLI, Windsurf |

**llms.txt is cheap and mostly ignored.** ~8–10% adoption, no W3C/IETF backing, and no
major AI company has committed to reading it. The AI *search* crawlers it names skip it
and crawl HTML. Its demonstrated consumers are IDE agents. Worth an hour; not worth
expectations.

**Watch, don't build on:** IETF **AIPREF** (`draft-ietf-aipref-vocab-06`) is genuine
standards-track work on AI usage preferences and the likeliest eventual answer.
**RSL 1.0** covers licensing and royalties — aimed at publishers monetising content, not
a blog giving it away. **MCP** is real but is infrastructure for tools, not articles.

**Crawler taxonomy**, for the robots.txt decision:

| Kind | Examples | Blocking costs |
|---|---|---|
| Training | GPTBot, ClaudeBot, Google-Extended | nothing in citations |
| Search | OAI-SearchBot, Claude-SearchBot, PerplexityBot | removal from AI answers |
| User-triggered | ChatGPT-User, Claude-User, Perplexity-User | the person asking gets nothing |

Current `robots.txt` allows everything, which is coherent for a site that wants readers.

---

## Phase 1 — emit the Markdown (no edge changes, no risk)

Astro emits `/entries/<slug>/index.md` next to `index.html`, from the same collection
entry. Nothing existing changes; new files appear in `dist/`.

This alone is useful: anything that knows the URL can fetch it, and phase 2 advertises
the URLs. **Phase 1 + 2 is a complete, zero-risk end state** — phase 3 is optional.

- [ ] `src/pages/entries/[slug]/index.md.ts` with `export const prerender = true`,
      returning the raw entry body with `content-type: text/markdown; charset=utf-8`
- [ ] Verify the raw body is still reachable on a collection entry under Astro 7's glob
      loader (`entry.body`) — check before designing around it
- [ ] Drafts excluded, same as the HTML routes — reuse `filterDrafts`
- [ ] Frontmatter title/description included as a heading or preamble, so the file stands
      alone when read out of context
- [ ] Build-integration test: one `.md` per published entry, none for drafts, and the
      body matches the source
- [ ] Record the measured token counts in the Log

## Phase 2 — make them discoverable (cheap, low expectations)

- [ ] `/llms.txt` — title, one-line description, and the `.md` URL for each entry
- [ ] Decide `robots.txt` deliberately against the taxonomy above and write the decision
      down, even if the answer stays "allow everything"
- [ ] Build-integration test: every URL in `llms.txt` resolves to a file in `dist/`

## Phase 3 — content negotiation at the edge (optional)

Makes `Accept: text/markdown` work on the canonical URL, rather than agents needing to
know the `.md` path. Phases 1 and 2 already deliver the token saving; this is convenience.

It is the only part that touches `infra/live/function.js`, which runs on **every request
to the site**. An unhandled exception there returns **HTTP 503** — so a bug is a full-site
outage, not a degraded feature.

**That risk is smaller than it first appears**, for two reasons established by testing
against the real account on 2026-08-31.

### What it would take

```javascript
// after the existing clean-URL rewrite in infra/live/function.js
var accept = (request.headers['accept'] && request.headers['accept'].value || '')
  .toLowerCase();

// ES5.1 runtime: indexOf, not includes. No const/let, arrows or template literals.
if (accept.indexOf('text/markdown') !== -1 && uri.indexOf('/entries/') === 0) {
  request.uri = uri.replace(/\/$/, '') + '/index.md';
}
```

### It is far more testable than expected — `aws cloudfront test-function`

The CLI runs a function **in CloudFront's real JavaScript engine**, against a synthetic
event, on the `DEVELOPMENT` stage — touching no distribution and no live traffic. It
returns the modified event, execution logs, compute utilisation, and any error. It is
scriptable, so it is an automated test rather than a console click.

Verified against the existing function:

```bash
ETAG=$(aws cloudfront describe-function --name subdirectory-index-rewrite \
  --stage DEVELOPMENT --query ETag --output text)
aws cloudfront test-function --name subdirectory-index-rewrite --if-match "$ETAG" \
  --stage DEVELOPMENT --event-object fileb://event.json
# → Errors: ""   Output: {"request":{"uri":"/about/index.html",...}}   Time: 6
```

### ⚠️ Publishing does **not** validate the runtime

A function using `const`, `String.includes` and a template literal was **created
successfully**. The error appears only when it runs:

```
SyntaxError: Token "const" not supported in this version in 2
```

So a syntactically invalid function can be published and sits there until a request hits
it — at which point every request 503s. **`create-function` is not a safety net;
`test-function` is.** This is the single most important thing on this page.

### Testing layers, and what each is worth

| Layer | Effort | Catches |
|---|---|---|
| Vitest on `function.js` (plain JS, no imports — read, eval, call `handler`) | ~30 min | routing logic, missing-header crashes |
| ESLint `ecmaVersion: 5` scoped to that file | ~10 min | ES6 **syntax** at commit time |
| **`aws cloudfront test-function` wired into `deploy.sh`** | ~1 hr | everything above, **in the real engine** — the authoritative gate |
| Cache separation | deploy required | **nothing catches this pre-deploy** |

### The one thing tests genuinely cannot catch

If the two formats share a cache entry, **nothing errors.** The site returns 200, tests
pass, and some visitors receive raw Markdown instead of a page. It is a property of the
distribution under real traffic, not of the function's output — `test-function` returns
the modified event and says nothing about what CloudFront then caches.

Rewriting the URI is what *should* prevent it: viewer-request functions transform request
attributes to construct the cache key (AWS's documented "normalise to improve hit ratio"
mechanism), so `/entries/x/index.html` and `/entries/x/index.md` occupy separate entries.
Putting raw `Accept` in the cache key instead would fragment it badly, since browsers send
many different values.

**Verify after deploying, once:**

```bash
curl -s -o /dev/null -w '%{content_type}\n' https://jgreen.one/entries/<slug>/
curl -s -o /dev/null -w '%{content_type}\n' -H 'Accept: text/markdown' https://jgreen.one/entries/<slug>/
curl -s -o /dev/null -w '%{content_type}\n' https://jgreen.one/entries/<slug>/   # must still be HTML
```

### A second thing tests cannot catch

Tests encode the assumptions held when they were written. The `googlebot` bug in the
withdrawn design was not a code error — the code would have done exactly what it said. It
was a **specification** error, and a complete green suite written from that spec would
have asserted "Googlebot receives the pack" and passed while de-indexing the site.

Tests lower the probability of failures you thought of. They do nothing about the ones you
did not.

### Why continuous deployment is *not* recommended here

An earlier draft of this task recommended CloudFront continuous deployment — a staging
distribution, a traffic policy, a promotion workflow. On reflection that is ceremony for
this site.

CloudFront Function updates propagate globally in well under a minute, so rollback is
"republish the previous code", not a distribution update. The worst case is a couple of
minutes of 503 on a personal blog with one post and minimal traffic. Continuous deployment
is the correct control for a business; here the consequence it protects against costs
roughly nothing.

**Measure propagation time once** before relying on this — it is documented as sub-minute
but has not been timed on this distribution.

### If phase 3 is done

- [ ] Vitest covering the existing rewrites, **written and green before the function is
      touched**: `/` → `/index.html`, `/about` → `/about/index.html`, a path with an
      extension passing through untouched
- [ ] A request with **no `accept` header** does not throw — the code reads
      `headers['accept'].value`, and a TypeError is a 503
- [ ] `aws cloudfront test-function` wired into `deploy.sh` as a gate, covering both the
      HTML and Markdown paths plus the no-header case
- [ ] ESLint at `ecmaVersion: 5` on `infra/live/function.js`
- [ ] Deployed, then the three-request cache check above run against the live site
- [ ] `curl -A` with a real Chrome UA and with Googlebot, confirming byte-identical HTML


## Acceptance criteria

- [ ] Phase 1: a `.md` per published entry, correct MIME type, drafts excluded, tested
- [ ] Phase 2: `llms.txt` lists every entry and every URL in it resolves
- [ ] A normal browser and Googlebot receive byte-identical HTML to today — the criterion
      that keeps the site in search results
- [ ] Full gate green: `npm run check`, `npm test`, `npm run test:build`,
      `npm run test:e2e`
- [ ] If phase 3 is attempted: `test-function` gating `deploy.sh`, ES5.1 lint, and the
      three-request cache-separation check run against the live distribution

## Notes

- No new dependencies. The earlier plan needed `remove-markdown` and
  `experimental_AstroContainer` for the text/HTML variants in the bulk packs; without
  those packs, the raw body is all that is needed.
- Serving one real post today. The reason to do this is that the mechanism is cheap and
  the plumbing then exists for future writing — not that AI discoverability of a
  610-word article is a problem worth solving.

### Research sources (2026-08-31)

- Cloudflare, Markdown for Agents:
  <https://developers.cloudflare.com/changelog/post/2026-02-12-markdown-for-agents/>
- Checkly, which agents actually send `Accept: text/markdown`:
  <https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/>
- CloudFront continuous deployment:
  <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/continuous-deployment.html>
- CloudFront Functions examples and cache-key normalisation:
  <https://github.com/aws-samples/amazon-cloudfront-functions>
- CloudFront 503 on function execution error:
  <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-503-service-unavailable.html>
- IETF AIPREF: <https://datatracker.ietf.org/wg/aipref/about/>
- RSL 1.0: <https://rslstandard.org/rsl>
- Evil Martians, techniques that work and don't:
  <https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms>
- AI crawler user-agent reference:
  <https://www.honeyb.ai/blog/ai-crawler-user-agents-reference-2026>

## Log

- 2025-09-28 Captured as a low-priority "nice to have".
- 2026-06-21 Migrated into the `todo/` system with the full plan inlined.
- 2026-08-30 Composed the pack builder onto the tested `filterDrafts`/`sortByDate`
  helpers and moved serialization into `src/utils/llmPack.ts`.
- 2026-08-31 **Researched the 2026 landscape and withdrew the original routing design.**
  It listed `googlebot`/`bingbot`/`msnbot` among the AI crawlers and rewrote them to the
  NDJSON pack, and User-Agent branching at one URL is cloaking regardless. Rebuilt around
  `Accept: text/markdown`.
- 2026-08-31 **Rewritten and cut down.** Dropped the JSON/NDJSON bulk packs entirely —
  speculative in 2025 and no evidence since that anything consumes them; that also
  removes the `remove-markdown` and `experimental_AstroContainer` dependencies.
  Re-split the phases by risk rather than by component: emitting the `.md` files touches
  no edge config and is now phase 1, while the CloudFront negotiation is phase 3 and
  optional. **Phases 1+2 are a complete zero-risk end state.**
  Researched phase 3 properly. A function exception returns **503**, and the function
  runs on every request, so a bug is a full-site outage rather than a degraded feature —
  which makes **CloudFront continuous deployment** (staging distribution, instant
  rollback by disabling the policy) the mitigation that actually matters, above any test.
  On caching: rewriting the URI is what keeps the two formats in separate cache entries,
  because viewer-request functions transform attributes *to build the cache key*; flagged
  for empirical verification rather than trust, since being wrong serves Markdown to
  people. Measured this site's real numbers: 30,010 → 4,972 bytes, ~83%. Not started.
- 2026-08-31 **Tested the phase 3 risk against the real account rather than reasoning
  about it — and it is materially more testable than this file previously said.**
  `aws cloudfront test-function` runs a function in CloudFront's actual JavaScript engine
  on the `DEVELOPMENT` stage, touching no distribution: verified against the existing
  function, which correctly returned `/about` → `/about/index.html` with no errors.
  It is scriptable, so it belongs in `deploy.sh` as a gate rather than being a manual
  console step, and the earlier claim that "a Node-based unit test cannot catch this
  class of bug" understated the options.
  **Corrected a wrong assumption in the process:** publishing does *not* validate the
  runtime. A function using `const`, `String.includes` and a template literal was created
  successfully and only failed when run —
  `SyntaxError: Token "const" not supported in this version`. So an invalid function can
  sit published until the first request 503s. `create-function` is not a safety net.
  Two things remain untestable, and both are now written down: **cache separation**, which
  fails silently with a 200 and no error, so it needs a post-deploy `curl` check; and
  **specification errors**, the class the withdrawn `googlebot` design belonged to, where
  a green suite written from a wrong spec passes while breaking the site.
  **Dropped the continuous-deployment recommendation.** Function updates propagate in
  under a minute, so rollback is republishing the previous code, and the worst case is a
  couple of minutes of 503 on a low-traffic personal blog. A staging distribution and
  promotion workflow is the right control for a business and ceremony here. Flagged that
  the propagation time should be measured once rather than assumed.
