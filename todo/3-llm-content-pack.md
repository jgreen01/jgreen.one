# LLM-Friendly Content Pack for AI Crawlers

**Priority**: LOW
**Status**: TODO — **plan revised 2026-08-31 after research; the original routing design is unsafe**
**Created**: 2025-09-28
**Updated**: 2026-08-31

## ⛔ Stop: the original design would have cloaked, and would have de-indexed the site

Two things in the plan below are actively dangerous and must not be implemented as
written.

**1. The User-Agent list includes `googlebot`, `bingbot` and `msnbot`.** Those are not AI
crawlers — they are the search engines the site depends on. Rewriting their request URI
to `/_llm/pack.ndjson` would serve Google and Bing a blob of JSON instead of the website.
That is not a subtle regression; it is removal from search results.

**2. Serving different content by User-Agent at the same URL is cloaking.** Google's spam
policies prohibit it explicitly, and it is one of the few practices that triggers both
algorithmic demotion and site-level manual penalties. The AI platforms care too: if
Anthropic, OpenAI or Perplexity detect that what they fetched does not match what a human
sees, the domain gets treated as unreliable and dropped from answers — the exact opposite
of the goal.

### The distinction that makes this safe

- **Different *content* to different agents** → cloaking. Penalised.
- **Same content in a different *format*, negotiated by the client** → HTTP content
  negotiation. A 27-year-old standard, used by every web API, explicitly fine.

Everything below is rewritten around the second. The goal is not to tell AI something
different; it is to hand it the same words without 80% of the payload being markup.

## What changed in the ecosystem since this was written

Researched 2026-08-31. The task was drafted in Sept 2025 and the landscape moved.

### Content negotiation won, and it is measurable

`Accept: text/markdown` on the *same* URL is now the mainstream approach. Cloudflare
shipped **Markdown for Agents** in Feb 2026 doing exactly this at the edge, and measured
a blog post dropping **16,180 → 3,150 tokens (80%)**. Checkly measured their own docs at
615 KB → 2.3 KB, **180,573 → 478 tokens (99.7%)**.

Crucially, this is not speculative — Checkly tested which agents actually send the header:

| Sends `Accept: text/markdown` | Does not |
|---|---|
| **Claude Code**, **Cursor**, **OpenCode** | OpenAI Codex, GitHub Copilot, Gemini CLI, Windsurf |

So roughly half of coding agents negotiate today, and the ones that do include the tool
this repo is developed with.

### llms.txt: cheap, harmless, and mostly ignored by the crawlers it names

Adoption is **~8–10%** of sites. But the measured reality is that **AI *search* crawlers
almost never fetch it** — GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and
Google-Extended overwhelmingly skip it and crawl HTML directly. As of Q1 2026 **no major
AI company has publicly committed to reading it**, and it has no W3C or IETF backing.

Its real, demonstrated consumer is **IDE agents** — Cursor, Windsurf, Claude Code,
Copilot, Cline and Aider look for `/llms.txt` and `/llms-full.txt` when pointed at a docs
site. Worth adding because it costs an hour, not because it will move AI search results.

### Genuinely new standards worth knowing about

- **IETF AIPREF working group** — real standards-track work on a vocabulary for
  expressing AI usage preferences, attached via robots.txt and HTTP headers.
  `draft-ietf-aipref-vocab-06` (April 2026). This is the one most likely to become *the*
  standard. **Watch it; do not build on a -06 draft.**
- **RSL (Really Simple Licensing) 1.0** — launched Sept 2025, now at Recommendation
  status. Embeds licensing and royalty terms (subscription, pay-per-crawl,
  pay-per-inference) in robots.txt. Reddit, Yahoo, Medium, O'Reilly, Quora, Ziff Davis
  adopted. Aimed at publishers monetising content — **not relevant to a personal blog**
  giving its writing away, but worth knowing the vocabulary exists.
- **MCP** — 17,000+ servers indexed by Q1 2026. A real option for exposing content to
  agents, but it is infrastructure for tools and data. **Overkill for a static blog**; a
  markdown endpoint achieves the same for a fraction of the effort.

### Crawler taxonomy now matters for robots.txt

Three distinct kinds, and the tradeoff differs:

| Kind | Examples | Blocking costs you |
|---|---|---|
| Training | GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, Meta-ExternalAgent | **nothing in citations** |
| Search | OAI-SearchBot, Claude-SearchBot, PerplexityBot | **removal from AI answers** |
| User-triggered | ChatGPT-User, Claude-User, Perplexity-User | **the user asking about you gets nothing** |

The current `robots.txt` is `User-agent: * / Allow: /` — everything permitted, which is a
coherent choice for a personal site that wants to be read. If that stays, say so
deliberately rather than by omission.

## Description

Make the site's writing cheap for AI agents to consume, by serving **the same content in
a lighter format** when a client asks for it — `Accept: text/markdown` returns markdown,
everything else returns the HTML it always did.

The original framing was "route detected bots to machine-readable mirrors". That has been
withdrawn: routing by detected identity is cloaking, and the detection list would have
caught Googlebot. See the top of this file.

## Acceptance Criteria

Reordered by value. **Phase 1 alone captures most of the benefit** and is the only part
that should be considered committed work; phases 2 and 3 are optional.

### Phase 1 — markdown per entry (the whole point)

- [ ] `/entries/<slug>/index.md` emitted next to `index.html`, same content, from the
      same collection entry
- [ ] `Accept: text/markdown` on `/entries/<slug>/` returns it; **no User-Agent branching
      anywhere**
- [ ] Correct MIME type (`text/markdown; charset=utf-8`)
- [ ] **Googlebot, Bingbot and a normal browser receive byte-identical HTML** to what
      they get today — verified explicitly with `curl -A`, because this is the criterion
      that keeps the site in search results
- [ ] `infra/live/function.js` unit-tested — **green baseline tests for the existing
      clean-URL rewrites written *first***, then the negotiation branch
- [ ] Reviewed for the CloudFront Functions ES5.1 runtime: no `includes`, no `some`, no
      `const`/`let`, no arrow functions, no template literals
- [ ] Verified in the CloudFront console test tab before deploying — a Node-based unit
      test cannot catch an ES5.1 violation
- [ ] Measured: token count of the markdown vs the HTML for one real entry, recorded in
      the Log so the benefit is a number rather than a claim

### Phase 2 — discovery (cheap, low expectations)

- [ ] `/llms.txt` listing the entries with titles, descriptions and `.md` links
- [ ] `robots.txt` reviewed against the training/search/user-triggered taxonomy, with the
      decision written down even if the answer stays "allow everything"

### Phase 3 — bulk packs (only if something actually wants them)

- [ ] `/_llm/pack.json`, `/_llm/pack.ndjson`, `/_llm/index.md`
- [ ] Per-entry metadata + `content_md`/`content_text`/`content_html` + SHA-256
      `content_hash`, drafts excluded, newest first
- [ ] Pure logic in `src/utils/llmPack.ts`, unit-tested; route files thin
- [ ] Serves at its own URLs only — **nothing is ever redirected to a pack**

### Throughout

- [ ] Full gate green: `npm run check`, `npm test`, `npm run test:build`,
      `npm run test:e2e`
- [ ] After deploying, confirm on the live site that a normal request and a
      `Accept: text/markdown` request return the same words in different formats

## Notes

- New dep needed: `remove-markdown` (plain-text extraction); uses `experimental_AstroContainer` for HTML rendering and Node `crypto` for hashing.
- Risk: a malformed CloudFront function breaks ALL site access — test thoroughly in staging, roll out gradually.

## Detailed Plan

### Per-entry schema
```typescript
interface LLMPackEntry {
  id: string; url: string; title: string; description: string;
  kind: "project" | "blog"; tags: string[];
  pubDate: string; updatedDate?: string; heroImage?: string;
  content_md: string; content_text: string; content_html: string;
  content_hash: string;   // SHA-256 of markdown
  word_count: number; reading_time: number;  // minutes @ 200 wpm
}
```

### Endpoints (Astro API routes, `export const prerender = true`)
- `src/pages/_llm/pack.json.ts` — full bundle: `{ version, site, generated_at, total_entries, links{self,ndjson,md_index,pubkey}, entries[] }`, `content-type: application/json`.
- `src/pages/_llm/pack.ndjson.ts` — one JSON object per line, `content-type: application/x-ndjson`.
- `src/pages/_llm/index.md.ts` — Markdown index linking all content.
- `src/pages/_llm/md/[slug].md.ts` — individual content pages in Markdown.

Build pattern (both packs): fetch with `getCollection('entries')`, then compose the
**existing helpers** from `src/utils/entries.ts` (added by task 4) rather than passing a
filter predicate — `sortByDate(filterDrafts(entries))`. Those helpers are already
unit-tested for draft exclusion and newest-first ordering, so this task does not need to
re-prove either. Render via `experimental_AstroContainer`, derive `content_text` with
`remove-markdown`, `content_hash` with `node:crypto` `createHash('sha256')`,
`cache-control: public, max-age=3600`, `x-content-type-options: nosniff`.

**Keep the serialization logic out of the route files.** Task 4 established that `.astro`
files and Astro route modules importing `astro:content` cannot be unit-tested — the
virtual module only exists during a build. Put the pure part in
`src/utils/llmPack.ts` — entry → `LLMPackEntry` mapping, hashing, word count, reading
time, NDJSON/Markdown serialization — taking plain objects. The route files stay thin:
call `getCollection`, hand the array to the helper, set headers.

### ~~CloudFront bot detection~~ → content negotiation on `Accept`

> **The original User-Agent sniffing design is withdrawn.** It listed `googlebot`,
> `bingbot` and `msnbot` alongside the AI crawlers and rewrote their URI to the NDJSON
> pack — which would have served search engines a JSON blob instead of the site. Even with
> those removed, branching on User-Agent to serve different bytes at one URL is cloaking.
> See the top of this file.

Route on what the client **asks for**, never on who it claims to be:

```javascript
// infra/live/function.js — after the existing clean-URL rewrite
var accept = (request.headers['accept'] && request.headers['accept'].value || '')
  .toLowerCase();

// Only for entry pages, and only when markdown is explicitly requested.
// No User-Agent branching: a browser sending Accept: text/html is unaffected,
// and Googlebot never sees anything different from a human.
if (accept.indexOf('text/markdown') !== -1 && uri.indexOf('/entries/') === 0) {
  request.uri = uri.replace(/\/$/, '') + '/index.md';
}
return request;
```

Three things this gets right that the original did not: it cannot affect a search engine,
it degrades to normal HTML for any client that does not ask, and it is a documented HTTP
mechanism rather than a trick.

**Watch the ES5.1 runtime.** CloudFront Functions is JS 1.0 — no `const`/`let`, no arrow
functions, no template literals, and **no `String.prototype.includes` or
`Array.prototype.some`** (both of which the withdrawn snippet used). Use
`indexOf(...) !== -1`. A Vitest unit test on Node 22 will happily pass code that throws in
production, and a thrown exception in a CloudFront Function is a 503 for that request — so
console verification stays mandatory.

An alternative worth weighing: **if the site ever moves behind Cloudflare, "Markdown for
Agents" does this at the edge with no origin code at all.** It is beta, free on paid
plans. Not a reason to switch CDN, but it makes this a solved problem elsewhere.

### The build side: emit `.md` alongside each entry

The negotiation above needs a real file to point at. Astro can emit
`/entries/<slug>/index.md` next to `index.html` from the same content — same words,
different serialization, which is precisely what keeps this content negotiation rather
than cloaking. That single change delivers most of the value here; the JSON/NDJSON packs
below are a nice-to-have on top.

## Testing

Two genuinely risky pieces here, and they need different kinds of test.

### 1. The pack builder — unit tests (`tests/unit/llmPack.test.ts`)

Drive `src/utils/llmPack.ts` from fixtures, never live content:

- **Mapping:** a fixture entry produces every field in `LLMPackEntry`, with `url`
  absolute (`https://jgreen.one/entries/<slug>`) and dates as ISO strings.
- **`content_hash` is stable and content-derived:** same markdown → same hash; one
  character changed → different hash. Assert the exact SHA-256 of a short fixed string
  so a hashing-algorithm change cannot slip by.
- **`word_count` / `reading_time`:** exact counts on a fixture of known length; check
  rounding at the boundary (199 vs 200 vs 201 words).
- **NDJSON shape:** one object per line, no trailing blank line, every line
  independently `JSON.parse`-able, and **embedded newlines in `content_md` do not break
  the format** — this is the classic NDJSON bug and the blog post is full of code fences.
- **Drafts never appear** — reuse `tests/fixtures/entries.ts`, which already has a draft
  and a draft-only tag (`secret-tag`) to assert against.
- **No leakage:** no absolute filesystem path and no `draft` field in the output.

### 2. The CloudFront function — this is the dangerous one

> **A malformed `function.js` breaks every request to the site**, not just bot traffic.
> It is the highest-risk change in this task by a wide margin.

`infra/live/function.js` is plain JS with no imports, so it *is* unit-testable — read
the file, evaluate it, call `handler(event)` with synthetic events. Add
`tests/unit/cloudfrontFunction.test.ts`:

- **Every existing rewrite still works** — `/` → `/index.html`, `/about` →
  `/about/index.html`, `/blog/` → `/blog/index.html`, and a path with an extension
  (`/favicon.svg`, `/og/home_1024×1024.png`) passes through untouched. Write these
  **first, before touching the function**, so you have a green baseline proving the
  current behaviour before adding bot routing.
- **Each crawler UA in the list** routes to `/_llm/pack.ndjson`.
- **A normal browser UA does not** — include a real Chrome, Firefox and Safari UA
  string; a substring match like `googlebot` must not catch an ordinary user.
- **Case-insensitivity** and a **missing `user-agent` header entirely** (the function
  reads `headers['user-agent'].value` — guard it, an absent header must not throw; a
  thrown exception in a CloudFront function is a 503 for that request).
- **`Accept` matching:** `application/x-ndjson` routes, but plain
  `text/html,application/xhtml+xml,...` does not. Note the draft plan routes on
  `application/json` too — decide whether that is too broad, since a `fetch()` from a
  human's browser often sends it.

The CloudFront Functions runtime is JS 1.0 (ES5.1) — no `const`/`let`, arrow functions,
`Array.prototype.includes`, or template literals. `String.prototype.includes` in the
draft snippet above **is not available**; use `indexOf(...) !== -1`. A unit test running
on Node 22 will happily pass code that fails in production, so also verify in the
CloudFront console's test tab before deploying.

### 3. Build integration

Extend `tests/integration/build.test.mjs`:

- `dist/_llm/pack.json`, `pack.ndjson`, `index.md` and at least one `md/<slug>.md` exist
- `pack.json` parses and `total_entries` matches the number of `entries/*/index.html`
  pages actually built — catches the pack and the site disagreeing about what published
- every NDJSON line parses
- no draft slug appears in any `_llm/` output (mirrors the existing draft assertion)

### 4. End-to-end

Add to `tests/e2e/`: fetch `/_llm/pack.ndjson` and `/_llm/pack.json` via
`request.get()` and assert the `content-type` headers. Note that `astro preview` will
**not** exercise the CloudFront function — bot routing can only be verified against a
real distribution, so treat the deployed check as mandatory:

```bash
curl -sI -A 'GPTBot/1.0' https://jgreen.one/            # expect the ndjson pack
curl -sI -A 'Mozilla/5.0 ... Chrome/120' https://jgreen.one/   # expect normal HTML
```

### Gate

```bash
npm run check && npm test && npm run test:build && npm run test:e2e
```

Then deploy and immediately re-run the two `curl` checks above plus a plain browser
load. If the function misbehaves, roll back `function.js` first and diagnose after —
every second it is broken, the whole site is down.

### Optional Phase 4 — content integrity/signing
Ed25519 signatures (RFC 9421-style HTTP Message Signatures), public key published at `/_llm/llm-pack.pub`, signature metadata in the JSON pack.

### Risks & mitigations
- Malformed CloudFront function breaks all access → test in staging, gradual rollout.
- Content exposure → filter drafts, sanitize, review exposed fields.
- Bot traffic spikes → rate limiting (see [aws-waf-protection](aws-waf-protection.md)), monitor.

### Research sources (2026-08-31)

- Cloudflare, Markdown for Agents changelog (Feb 2026):
  <https://developers.cloudflare.com/changelog/post/2026-02-12-markdown-for-agents/>
- Checkly, "The Current State of Content Negotiation for AI Agents" — which agents
  actually send the header, and the token measurements:
  <https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/>
- IETF AIPREF working group charter: <https://datatracker.ietf.org/wg/aipref/about/>
- `draft-ietf-aipref-vocab`: <https://datatracker.ietf.org/doc/draft-ietf-aipref-vocab/>
- RSL 1.0 specification: <https://rslstandard.org/rsl>
- Evil Martians, "6 techniques that work, 8 that don't" — a rare piece that reports
  negative results: <https://evilmartians.com/chronicles/how-to-make-your-website-visible-to-llms>
- Conductor, on AEO cloaking as a risk rather than a tactic:
  <https://www.conductor.com/academy/aeo-cloaking/>
- AI crawler user-agent reference (training / search / user-triggered split):
  <https://www.honeyb.ai/blog/ai-crawler-user-agents-reference-2026>

### Dependencies
- Astro `getCollection`, `experimental_AstroContainer`; Node `crypto`; `remove-markdown` (add to `package.json`); CloudFront Functions runtime (JS 1.0).

### Open questions
- Filter any content/tags? Rate-limit bot traffic? Regeneration cadence? Strict allowlist vs pattern matching? Track LLM-pack usage separately?

## Log

- 2025-09-28 Captured as a low-priority "nice to have".
- 2026-06-21 Migrated into the `todo/` system with the full plan inlined.
- 2026-08-30 **Revised after task 4 landed.** Pack building now composes the tested
  `filterDrafts`/`sortByDate` helpers from `src/utils/entries.ts` instead of a
  `getCollection` predicate, and the serialization logic moves to `src/utils/llmPack.ts`
  so it is unit-testable — Astro route modules importing `astro:content` are not.
  Added a full **Testing** section. Two things it surfaced that the original plan
  understated: (1) `infra/live/function.js` is plain JS and therefore *is* unit-testable,
  so the existing clean-URL rewrites should get a green baseline test **before** bot
  routing is bolted on — a broken function takes the whole site down, not just bot
  traffic; (2) the draft snippet uses `String.prototype.includes` and `Array.prototype.
  some`, which **do not exist in the CloudFront Functions JS 1.0 (ES5.1) runtime** — a
  Node-based unit test would pass code that fails in production, so console verification
  stays mandatory. Also flagged that routing on `Accept: application/json` may be too
  broad, since browser `fetch()` calls often send it. Not started.
- 2026-08-31 **Researched the 2026 landscape; the original design is withdrawn as unsafe.**
  Two problems. The User-Agent list included `googlebot`, `bingbot` and `msnbot` and
  rewrote their URI to the NDJSON pack — that would have served search engines a JSON blob
  instead of the website. And branching on User-Agent to serve different bytes at one URL
  is cloaking, which Google penalises at site level and which causes AI platforms to treat
  a domain as unreliable. Rewritten around HTTP content negotiation on
  `Accept: text/markdown` instead: same content, different format, same URL, no
  User-Agent inspection anywhere.
  Evidence gathered: Cloudflare shipped **Markdown for Agents** (Feb 2026) doing exactly
  this at the edge, measuring 16,180 → 3,150 tokens (80%); Checkly measured their docs at
  180,573 → 478 tokens (99.7%) and tested which agents actually send the header — Claude
  Code, Cursor and OpenCode do; Codex, Copilot, Gemini CLI and Windsurf do not.
  On llms.txt: adoption is ~8–10%, but AI *search* crawlers overwhelmingly skip it and no
  major AI company has committed to reading it. Its real consumers are IDE agents. Kept,
  demoted to phase 2, with honest expectations.
  New standards noted for awareness: **IETF AIPREF** (`draft-ietf-aipref-vocab-06`, the
  one most likely to become official — watch, do not build on a -06 draft), **RSL 1.0**
  (licensing/royalties; aimed at publishers monetising content, not a personal blog), and
  **MCP** (real, 17k+ servers, but infrastructure for tools — overkill here).
  Restructured into three phases so the valuable part (a `.md` per entry) is separable
  from the speculative part (bulk packs). Priority stays LOW. Not started.
