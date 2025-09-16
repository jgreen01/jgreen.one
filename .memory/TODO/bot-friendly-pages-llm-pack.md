# Feature: Bot-Friendly Pages — LLM Pack (JSON/NDJSON/MD) for Astro

## Goal

Expose a machine-readable mirror of the site at `/_llm/*` (JSON bundle, NDJSON stream, and Markdown variants) and route AI crawlers or clients that opt-in via `Accept` headers to these resources at the CDN layer. Do **not** modify the human-facing pages.

## Requirements

- [ ] **Astro endpoints** that prerender to static files (`export const prerender = true`) for:
      - `/_llm/pack.json` (site bundle)
      - `/_llm/pack.ndjson` (one object per line; streaming-friendly)
      - `/_llm/index.md` and `/_llm/md/[slug].md` (Markdown mirrors)  
      Use Astro Content Collections with `getCollection()` to pull content. :contentReference[oaicite:0]{index=0}
- [ ] **NDJSON compliance**: serve `Content-Type: application/x-ndjson` and write one JSON object per newline. :contentReference[oaicite:1]{index=1}
- [ ] **Optional integrity/signing** (“RFC 9421-style”): embed `content-digest` + `signatureInput` + `signature` fields in the JSON pack and publish `/_llm/llm-pack.pub` for verification. (This simulates HTTP Message Signatures for static assets.) :contentReference[oaicite:2]{index=2}
- [ ] **CloudFront Function** (viewer-request) to rewrite requests from:
      - Known LLM UAs (allowlist) and/or
      - Clients that send `Accept: application/x-ndjson` (or custom `application/llm+json`)  
      to `/_llm/pack.ndjson` (or `.json`). :contentReference[oaicite:3]{index=3}
- [ ] **Terraform wiring**: create and attach the CloudFront Function to the distribution’s default behavior. :contentReference[oaicite:4]{index=4}
- [ ] **User-Agent allowlist** (minimum viable):
      - OpenAI: `ChatGPT-User` / `OAI-SearchBot` / GPTBot (see OpenAI docs)
      - Anthropic: `Claude-User` / `ClaudeBot`
      - Perplexity: `PerplexityBot`
      - Google crawlers (for experimentation via UA negotiation)  
      Use official docs where available. :contentReference[oaicite:5]{index=5}
- [ ] **Cache headers**: `Cache-Control: public, max-age=3600` on packs; allow CDN caching.
- [ ] **No changes to human site HTML**; all bot behavior is opt-in via CDN rewrite or client `Accept` negotiation.

## Implementation Plan

1. **Add Astro endpoints**
   1. Create `src/pages/_llm/pack.json.ts` that reads from your content collections with `getCollection('blog')` (and others if needed). Include fields such as `id`, `url`, `title`, `description`, `tags`, `updated`, `content_md`, `content_text`, and a `hash` (sha256 of the MD). Return with `Content-Type: application/json`. Mark as `prerender = true` so it ships as a static file. :contentReference[oaicite:6]{index=6}
   2. Create `src/pages/_llm/pack.ndjson.ts` that emits **one JSON object per line** and sets `Content-Type: application/x-ndjson`. Prefer this as the default mirror for bots. :contentReference[oaicite:7]{index=7}
   3. Create Markdown mirrors: `src/pages/_llm/index.md.ts` (index with links) and `src/pages/_llm/md/[slug].md.ts` (per-page export). All with `prerender = true`. :contentReference[oaicite:8]{index=8}

2. **(Optional) Pack signing (RFC 9421-style)**
   - Add a post-build script that reads `dist/_llm/pack.json`, computes a SHA-256 digest, signs bytes with Ed25519, and writes `pack.signed.json` plus `llm-pack.pub`. Consumers can verify the embedded fields analogous to HTTP Message Signatures, adapted for static content. Reference RFC 9421 semantics. (If you later need true HTTP signatures, move to a signing proxy or Lambda@Edge.) :contentReference[oaicite:9]{index=9}

3. **CloudFront Function: UA/Accept negotiation**
   - Implement a **viewer-request** function that:
     - Parses `User-Agent` and `Accept`.
     - If `Accept` contains `application/x-ndjson` (or `application/llm+json` if you decide to use it), or `User-Agent` matches your allowlist, **rewrite** `request.uri` to `/_llm/pack.ndjson`.  
     Associate this function with the distribution’s default behavior. (CloudFront Functions are ideal for fast, header-based rewrites; use Lambda@Edge only if you need cryptography or KV lookups.) :contentReference[oaicite:10]{index=10}

4. **Terraform**
   - Define `aws_cloudfront_function` with your JS, `publish = true`, then reference it in the distribution’s `default_cache_behavior.function_associations` for `event_type = "viewer-request"`. Keep your existing S3 origin unchanged. :contentReference[oaicite:11]{index=11}

5. **User-Agent allowlist (initial)**
   - Start with documented, verifiable agents:
     - **OpenAI**:  
       - `ChatGPT-User` (on-demand fetching) and **GPTBot** mention; OpenAI also documents **OAI-SearchBot** for discovery. :contentReference[oaicite:12]{index=12}
     - **Anthropic**: `Claude-User` (on-demand) and `ClaudeBot` (crawler). :contentReference[oaicite:13]{index=13}
     - **Perplexity**: `PerplexityBot`. :contentReference[oaicite:14]{index=14}
     - **Google**: overview of Google crawlers; you may experiment with selective routing based on product needs. :contentReference[oaicite:15]{index=15}
   - Keep the list conservative and **document the exact strings you match**. (Optionally verify by reverse DNS/IP if you later add enforcement.)

6. **Headers & caching**
   - For JSON/NDJSON: `Content-Type` set correctly; `Cache-Control: public, max-age=3600`.  
   - For MD: `text/markdown; charset=utf-8`.  
   These are static assets; CloudFront will cache aggressively. (Etag/Last-Modified are added by S3/CloudFront automatically in most setups.)

7. **Testing**
   - Local: `astro build` then serve `dist/` to confirm `/_llm/*` outputs.  
   - Staging: deploy, then send requests with:
     - `curl -H 'Accept: application/x-ndjson' https://example.com/anything` → should return `/_llm/pack.ndjson`.
     - Spoofed UA strings for documented bots to confirm rewrites.
   - Verify CDN cache behavior and that human pages remain unchanged.

8. **Docs & discoverability (optional but useful)**
   - Publish `/_llm/README` or add a note in your site docs about the LLM Pack endpoints so integrators can self-serve.
   - Consider explicitly allowing documented AI crawlers in `robots.txt` (optional; outside the “no human site changes” constraint). :contentReference[oaicite:16]{index=16}

## Open Questions

- [ ] **Media type**: Keep it simple with `application/x-ndjson` and `application/json`, or also advertise a custom `application/llm+json`? (Custom types are non-standard; NDJSON is broadly understood.) :contentReference[oaicite:17]{index=17}
- [ ] **Which collections**: Only blog, or include docs/pages/taxonomies? (Decide per site structure.)
- [ ] **Signing**: Is the embedded “9421-style” signature sufficient, or should we move to a signing proxy that emits real HTTP Message Signatures for each response? :contentReference[oaicite:18]{index=18}
- [ ] **Bot scope**: Route only AI crawlers, or also large social bots (Facebook/Twitter/LinkedIn) to MD for cheaper parsing? (We can keep them on HTML for link previews.)
- [ ] **Google**: Should we ever route Google crawlers? Probably **no** for search, but you may experiment in a non-indexed environment. :contentReference[oaicite:19]{index=19}

## Notes

- **Astro tech**: Endpoints are prerendered by default in static output; `export const prerender = true` makes the outputs fully static on S3/CloudFront. Use `getCollection()` from Content Collections to query Markdown safely and consistently. :contentReference[oaicite:20]{index=20}
- **NDJSON**: One object per line; MIME `application/x-ndjson`; ideal for streaming/line-wise processing. :contentReference[oaicite:21]{index=21}
- **CloudFront Functions**: Best for fast header/URI rewrites on the edge. Use Lambda@Edge only if you need crypto, network calls, or KV. Associate the function at **viewer-request**. :contentReference[oaicite:22]{index=22}
- **User Agents (docs)**:
  - OpenAI mentions GPTBot & documents the `ChatGPT-User` UA; OpenAI also documents **OAI-SearchBot** for site discovery. :contentReference[oaicite:23]{index=23}
  - Anthropic documents `Claude-User` and `ClaudeBot`. :contentReference[oaicite:24]{index=24}
  - Perplexity documents `PerplexityBot`. :contentReference[oaicite:25]{index=25}
- **Standards**: HTTP Message Signatures is RFC 9421; we’re borrowing its concepts inside the pack for verifiability without dynamic headers. :contentReference[oaicite:26]{index=26}

## Code Sketches

### Astro — `/_llm/pack.json.ts`
```ts
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';
import removeMd from 'remove-markdown';

export const GET: APIRoute = async ({ site }) => {
  const blog = await getCollection('blog'); // add other collections as needed
  const pages = blog.map((e) => {
    const body = (e as any).body ?? '';
    return {
      id: e.id,
      url: new URL(`/${e.slug}/`, site!).toString(),
      title: e.data.title ?? e.slug,
      description: e.data.description ?? '',
      tags: e.data.tags ?? [],
      language: e.data.lang ?? 'en',
      updated: (e.data.updated ?? e.data.pubDate ?? null),
      content_md: body,
      content_text: removeMd(body),
      hash: createHash('sha256').update(body).digest('base64'),
    };
  });

  const pack = {
    version: '1.0',
    site: site?.toString() ?? '',
    createdAt: new Date().toISOString(),
    links: {
      self: '/_llm/pack.json',
      ndjson: '/_llm/pack.ndjson',
      md_index: '/_llm/index.md',
      pubkey: '/_llm/llm-pack.pub'
    },
    pages
  };

  return new Response(JSON.stringify(pack, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
};
```

### Astro — `/_llm/pack.ndjson.ts`

```ts
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';
import removeMd from 'remove-markdown';

export const GET: APIRoute = async ({ site }) => {
  const blog = await getCollection('blog');
  const lines = blog.map((e) => {
    const body = (e as any).body ?? '';
    return JSON.stringify({
      id: e.id,
      url: new URL(`/${e.slug}/`, site!).toString(),
      title: e.data.title ?? e.slug,
      description: e.data.description ?? '',
      tags: e.data.tags ?? [],
      language: e.data.lang ?? 'en',
      updated: (e.data.updated ?? e.data.pubDate ?? null),
      content_md: body,
      content_text: removeMd(body),
      hash: createHash('sha256').update(body).digest('base64'),
    });
  }).join('\n');

  return new Response(lines + '\n', {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
};
```

### Astro — `/_llm/index.md.ts` and `/_llm/md/[slug].md.ts`

```ts
// index.md.ts
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  const blog = await getCollection('blog');
  const rows = blog.map((e) => `- [${e.data.title ?? e.slug}](/_llm/md/${e.slug}.md)`).join('\n');
  const md = `---
title: "LLM Pack MD Index"
llm_pack: v1
site: ${site?.toString() ?? ''}
---
# LLM Pack (Markdown)
${rows}
`;
  return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};

// md/[slug].md.ts
export const prerender = true;
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ params, site }) => {
  const blog = await getCollection('blog');
  const entry = blog.find((e) => e.slug === params.slug);
  if (!entry) return new Response('Not found', { status: 404 });
  const body = (entry as any).body ?? '';
  const md = `---
llm_pack: v1
id: ${entry.id}
url: ${new URL(`/${entry.slug}/`, site!).toString()}
title: ${entry.data.title ?? entry.slug}
updated: ${entry.data.updated ?? entry.data.pubDate ?? ''}
tags: ${JSON.stringify(entry.data.tags ?? [])}
language: ${entry.data.lang ?? 'en'}
---
${body}
`;
  return new Response(md, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
```

### (Optional) Post-build signing script (writes `pack.signed.json` + `llm-pack.pub`)

```js
// scripts/sign-llm-pack.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

const [, , packPath, privPath, pubPath] = process.argv;

let privateKeyPem, publicKeyPem;
if (privPath && pubPath) {
  privateKeyPem = readFileSync(privPath);
  publicKeyPem  = readFileSync(pubPath);
} else {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicKeyPem  = publicKey.export({ type: 'spki',  format: 'pem' });
}

const buf = readFileSync(packPath);
const digestB64 = createHash('sha256').update(buf).digest('base64');
const signatureB64 = sign(null, buf, privateKeyPem).toString('base64');

const pack = JSON.parse(buf.toString());
pack["content-digest"] = `sha-256=:${digestB64}:`;
pack["signatureInput"] = `sig=("@content-digest");created=${Math.floor(Date.now()/1000)};keyid="llm-pack-ed25519"`;
pack["signature"] = `sig=:${signatureB64}:`;

writeFileSync(packPath.replace(/\.json$/, '.signed.json'), JSON.stringify(pack, null, 2));
writeFileSync(packPath.replace(/pack.json$/, 'llm-pack.pub'), publicKeyPem);
```

### CloudFront Function (viewer-request) — rewrite to NDJSON

```js
function handler(event) {
  var req = event.request;
  var h = req.headers || {};
  var ua = (h['user-agent'] && h['user-agent'].value || '').toLowerCase();
  var accept = (h['accept'] && h['accept'].value || '').toLowerCase();

  // Simple allowlist (document exact tokens you match)
  var bots = [
    'chatgpt-user',        // OpenAI on-demand fetcher
    'oai-searchbot',       // OpenAI search crawler
    'gptbot',              // OpenAI crawler (training/discovery)
    'claude-user',         // Anthropic on-demand fetcher
    'claudebot',           // Anthropic crawler
    'perplexitybot'        // Perplexity crawler
  ];

  var acceptLlm = accept.indexOf('application/x-ndjson') !== -1 ||
                  accept.indexOf('application/llm+json') !== -1;

  var isBotUA = bots.some(function (b) { return ua.indexOf(b) !== -1; });

  if (acceptLlm || isBotUA) {
    req.uri = '/_llm/pack.ndjson'; // Prefer NDJSON mirror
  }
  return req;
}
```

### Terraform — attach the function

```hcl
resource "aws_cloudfront_function" "llm_router" {
  name    = "llm-router"
  runtime = "cloudfront-js-1.0"
  publish = true
  code    = file("${path.module}/cf_functions/llm-router.js")
}

resource "aws_cloudfront_distribution" "site" {
  # ... existing config (origins, certs, aliases, etc.)

  default_cache_behavior {
    # ... existing behavior (viewer_protocol_policy, allowed_methods, etc.)
    function_associations {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.llm_router.arn
    }
  }
}
```

## Done When

* [ ] `/_llm/pack.json`, `/_llm/pack.ndjson`, `/_llm/index.md`, and `/_llm/md/*` appear in `dist/` and on CloudFront.
* [ ] Requests with `Accept: application/x-ndjson` anywhere on the domain return the NDJSON pack via CDN rewrite.
* [ ] Known LLM UAs receive the NDJSON pack by default; human visitors see normal pages.
* [ ] (Optional) `/_llm/pack.signed.json` + `/_llm/llm-pack.pub` are published and documented.
