---
title: "Serving Markdown to AI Agents: 73% Fewer Tokens, Same Content"
description: "How to publish a Markdown copy of every page from Astro and negotiate it at the CloudFront edge — without accidentally cloaking your site."
pubDate: 2026-08-31
kind: "blog"
heroImage: "/media/serving-markdown-to-ai-agents.webp"
tags: ["astro", "aws", "cloudfront", "llm", "ai", "seo", "content-negotiation"]
draft: false
---

When an AI agent reads an article here, it downloads the nav, the footer, the meta tags and every Tailwind class. The words are a minority of the payload.

| | Bytes | ~Tokens |
|---|---|---|
| Rendered HTML | 30,010 | ~7,502 |
| Markdown | 7,975 | ~1,993 |

**73% smaller.** Cloudflare measured 80% doing this at their edge; Checkly measured 99.7% on a markup-heavy docs page.

Three parts: an Astro endpoint emitting `.md` alongside every page, an `llms.txt` advertising them, and a CloudFront Function serving Markdown to anything sending `Accept: text/markdown`. All code below is what runs in production.

---

## First, the trap

Detecting AI crawlers by User-Agent and serving them something different is **cloaking** — one of the few practices triggering both algorithmic demotion and a site-level manual penalty from Google. It also backfires: if OpenAI or Anthropic notice the fetched content doesn't match what a human sees, the rational response is to stop citing you.

My first draft had a crawler list containing `googlebot`, `bingbot` and `msnbot`, rewriting them to a JSON bundle. Shipped, it would have served Google a blob of JSON instead of my website.

The distinction:

- Different **content** per agent → cloaking.
- Same content, different **format**, chosen by the client → content negotiation.

**Never branch on who is asking. Branch only on what they asked for.** Everything below follows that rule, so search engines see byte-identical HTML.

---

## Part 1: Emit Markdown from Astro

Content collections already hold the raw body as `entry.body`, so the endpoint is mostly formatting.

```ts
// src/pages/entries/[slug]/index.md.ts
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const prerender = true;

export async function getStaticPaths() {
  const entries = await getCollection("entries", (e) => !e.data.draft);
  return entries.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

export const GET: APIRoute = ({ props, site }) => {
  const { entry } = props;

  const document = [
    `# ${entry.data.title}`,
    "",
    `> ${entry.data.description}`,
    "",
    `Published: ${entry.data.pubDate.toISOString().slice(0, 10)}`,
    `Source: ${site}entries/${entry.id}`,
    "",
    "---",
    "",
    entry.body.trim(),
    "",
  ].join("\n");

  return new Response(document, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
```

Sits next to your existing `[slug].astro` without conflict. The build emits both `index.html` and `index.md`.

Three details that matter:

- **Include the canonical URL.** The file is read with no surrounding page. Without it an agent can quote you but not cite you — and the citation is the whole return.
- **Pass the body through untouched.** No summarising. The moment the Markdown says something the HTML doesn't, you're cloaking again.
- **`site` already ends in a slash**, so it's `${site}entries/…`, not `${site}/entries/…`.

---

## Part 2: Advertise with llms.txt

```ts
// src/pages/llms.txt.ts
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const entries = await getCollection("entries", (e) => !e.data.draft);

  const lines = [
    "# Your Site Name",
    "",
    "> One-line description of the site.",
    "",
    "## Posts",
    "",
    ...entries.map(
      (e) => `- [${e.data.title}](${site}entries/${e.id}/index.md): ${e.data.description}`,
    ),
  ];

  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
```

Point links at the `.md` files, or it's a sitemap with extra steps.

**Keep expectations low.** Adoption is ~8–10%, there's no W3C or IETF backing, and as of early 2026 no major AI company has committed to reading it — the AI *search* crawlers it nominally serves mostly crawl HTML instead. Its real audience is IDE agents: Claude Code, Cursor, Copilot, Cline.

**Stopping here gives you a complete, zero-risk setup.** No infrastructure touched. Part 3 is convenience.

---

## Part 3: Negotiate at the CloudFront edge

This makes `Accept: text/markdown` work on the canonical URL, so agents needn't know the `.md` path exists. Of seven coding agents Checkly tested, three send that header — Claude Code, Cursor, OpenCode. Codex, Copilot, Gemini CLI and Windsurf don't.

```js
// infra/live/function.js — CloudFront viewer-request function
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Guard every access: a TypeError here returns 503 for the request.
    var acceptHeader = request.headers && request.headers['accept'];
    var accept = acceptHeader && acceptHeader.value
        ? acceptHeader.value.toLowerCase()
        : '';

    // Branch on what was ASKED FOR, never on who is asking.
    if (accept.indexOf('text/markdown') !== -1 && uri.indexOf('/entries/') === 0) {
        var slug = uri.slice('/entries/'.length).replace(/\/$/, '');
        // Single path segment only: skips the /entries/ index and any asset.
        if (slug.length > 0 && slug.indexOf('/') === -1 && slug.indexOf('.') === -1) {
            request.uri = '/entries/' + slug + '/index.md';
            return request;
        }
    }

    // Existing clean-URL rewrites.
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (uri.indexOf('.') === -1) {
        request.uri += '/index.html';
    }

    return request;
}
```

### Why this doesn't poison your cache

Rewriting the **URI** is what keeps the formats separate: viewer-request functions transform request attributes *to build the cache key*, so `/entries/x/index.html` and `/entries/x/index.md` occupy different cache entries. Putting raw `Accept` in the cache key instead would shatter it — browsers send dozens of variants.

Verify anyway, in this order. The failure is silent: no error, just some visitors receiving raw Markdown.

```bash
URL=https://yoursite.com/entries/some-post/

curl -s -o /dev/null -w '%{content_type}\n' "$URL"
curl -s -o /dev/null -w '%{content_type}\n' -H 'Accept: text/markdown' "$URL"
curl -s -o /dev/null -w '%{content_type}\n' "$URL"   # must still be text/html
```

---

## Testing without breaking your site

This function runs on **every request**. An unhandled exception returns HTTP 503 — a total outage, not a degraded feature.

AWS will run your function in its real engine:

```bash
aws cloudfront test-function \
  --name your-function-name \
  --if-match "$(aws cloudfront describe-function --name your-function-name \
      --stage DEVELOPMENT --query ETag --output text)" \
  --stage DEVELOPMENT \
  --event-object fileb://event.json
```

```json
{
  "version": "1.0",
  "context": { "eventType": "viewer-request" },
  "viewer": { "ip": "203.0.113.1" },
  "request": {
    "method": "GET",
    "uri": "/entries/some-post/",
    "headers": { "accept": { "value": "text/markdown" } },
    "cookies": {},
    "querystring": {}
  }
}
```

It returns the modified request, logs and any error. Loop it over a table of cases and you have a CI gate.

Three things I learned the hard way:

**Publishing does not validate the runtime.** A function using `const` is *created successfully* and only fails when a request hits it:

```
SyntaxError: Token "const" not supported in this version
```

It sits there quietly until the first request, then every request 503s. `create-function` is not a safety net; `test-function` is.

**The constraint is ES5.1 *syntax*, not the ES5.1 standard library.** Plenty of guidance says avoid `String.includes`. I probed the real runtime: `String.includes`, `startsWith`, `Array.includes`, `Array.some` and `Object.assign` all work. What breaks is `const`/`let`, arrow functions and template literals — at *parse* time, which is why one bad token takes down every route rather than just the new one.

**Don't test against your live function's DEVELOPMENT stage.** If Terraform manages the function, publishing candidate code there makes `terraform plan` report *"No changes"* — that's the stage it compares against — while the `LIVE` stage serving traffic stays stale. Your gate silently blocks the deploy it was validating. Create a throwaway function, test in it, delete it.

---

## What I skipped

**CloudFront continuous deployment.** Correct for a business; ceremony for a personal site. Function updates propagate in under a minute, so rollback is republishing, and the worst case is a couple of minutes of downtime.

**Bulk JSON/NDJSON bundles.** My original plan had `/pack.ndjson` with per-entry hashes and reading times. I found no evidence anything consumes that shape. A Markdown file per page is where the ecosystem landed.

---

## Worth tracking, not building on

The IETF's **AIPREF** working group is doing standards-track work on a vocabulary for AI usage preferences via `robots.txt` and HTTP headers — the likeliest eventual answer, still a draft. **RSL 1.0** covers licensing and royalties for publishers wanting payment for training use (Reddit, Yahoo, Medium, O'Reilly have adopted it). Neither matters if you're giving the writing away.

While in `robots.txt`, decide deliberately. AI crawlers split three ways:

| Kind | Examples | Blocking costs you |
|---|---|---|
| Training | GPTBot, ClaudeBot, Google-Extended | nothing in citations |
| Search | OAI-SearchBot, Claude-SearchBot, PerplexityBot | removal from AI answers |
| User-triggered | ChatGPT-User, Claude-User, Perplexity-User | the person asking about you gets nothing |

I allow all three, and wrote the reasoning into the file so future-me knows it was a choice.

---

An agent sending one header gets my writing for a quarter of the tokens. Everything else — every browser, Googlebot, any crawler that doesn't ask — gets byte-identical HTML.

A couple of hundred lines, and the only risky part is optional.

Source: [github.com/jgreen01/jgreen.one](https://github.com/jgreen01/jgreen.one).
