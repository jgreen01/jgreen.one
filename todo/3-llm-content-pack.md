# LLM-Friendly Content Pack for AI Crawlers

**Priority**: LOW
**Status**: TODO
**Created**: 2025-09-28
**Updated**: 2026-08-30

## Description

Add machine-readable mirrors of site content under `/_llm/*` (JSON, NDJSON, Markdown) so AI crawlers and LLM apps can consume content efficiently, and route detected bots there via the CloudFront function — all without changing the human-facing site.

## Acceptance Criteria

- [ ] Prerendered Astro endpoints: `/_llm/pack.json`, `/_llm/pack.ndjson`, `/_llm/index.md`, `/_llm/md/[slug].md`
- [ ] Each entry includes metadata + `content_md`/`content_text`/`content_html` + `content_hash` (SHA-256), built from the `entries` collection (drafts excluded, newest first)
- [ ] CloudFront `function.js` extended to detect AI crawler User-Agents / `Accept` headers and route them to `/_llm/pack.ndjson`, preserving existing clean-URL rewrites
- [ ] Human-facing pages unchanged; correct MIME types (`application/json`, `application/x-ndjson`, `text/markdown`)
- [ ] Builds cleanly into `dist/_llm/`; deploy via existing `scripts/deploy.sh`
- [ ] Pure logic lives in `src/utils/llmPack.ts` and is unit-tested; route files are thin
- [ ] `infra/live/function.js` has unit tests covering the **existing** rewrites written
      *before* bot routing is added, plus the new crawler/`Accept` matching
- [ ] Full gate green (`npm run check`, `npm test`, `npm run test:build`,
      `npm run test:e2e`), then bot routing verified against the deployed distribution
      with `curl -A`

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

### CloudFront bot detection — extend `infra/live/function.js`
Keep existing clean-URL rewrite, then:
```javascript
var userAgent = (headers['user-agent'] && headers['user-agent'].value || '').toLowerCase();
var accept    = (headers['accept'] && headers['accept'].value || '').toLowerCase();
var aiCrawlers = ['chatgpt-user','gptbot','oai-searchbot','claude-user','claudebot',
                  'perplexitybot','bingbot','msnbot','googlebot','google-other'];
var acceptsLlm = accept.includes('application/x-ndjson') ||
                 accept.includes('application/llm+json') || accept.includes('application/json');
var isAiCrawler = aiCrawlers.some(function (c) { return userAgent.includes(c); });
if (isAiCrawler || acceptsLlm) { request.uri = '/_llm/pack.ndjson'; }
return request;
```

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
