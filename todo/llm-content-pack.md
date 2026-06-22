# LLM-Friendly Content Pack for AI Crawlers

**Priority**: LOW
**Status**: TODO
**Created**: 2025-09-28
**Updated**: 2026-06-21

## Description

Add machine-readable mirrors of site content under `/_llm/*` (JSON, NDJSON, Markdown) so AI crawlers and LLM apps can consume content efficiently, and route detected bots there via the CloudFront function — all without changing the human-facing site.

## Acceptance Criteria

- [ ] Prerendered Astro endpoints: `/_llm/pack.json`, `/_llm/pack.ndjson`, `/_llm/index.md`, `/_llm/md/[slug].md`
- [ ] Each entry includes metadata + `content_md`/`content_text`/`content_html` + `content_hash` (SHA-256), built from the `entries` collection (drafts excluded, newest first)
- [ ] CloudFront `function.js` extended to detect AI crawler User-Agents / `Accept` headers and route them to `/_llm/pack.ndjson`, preserving existing clean-URL rewrites
- [ ] Human-facing pages unchanged; correct MIME types (`application/json`, `application/x-ndjson`, `text/markdown`)
- [ ] Builds cleanly into `dist/_llm/`; deploy via existing `scripts/deploy.sh`

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

Build pattern (both packs): `getCollection('entries', ({data}) => !data.draft)`, render via `experimental_AstroContainer`, derive `content_text` with `remove-markdown`, `content_hash` with `node:crypto` `createHash('sha256')`, sort newest-first, `cache-control: public, max-age=3600`, `x-content-type-options: nosniff`.

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
