---
title: "Under the Hood, One Year On: Tests Are What Make AI Iteration Fast"
description: "Zero tests to 484, two Astro majors migrated, an edge feature shipped — in a day. The tests were what made the speed possible, not what slowed it."
pubDate: 2026-08-31
kind: "blog"
heroImage: "/media/testing-makes-ai-iteration-fast.webp"
tags: ["ai", "testing", "astro", "aws", "workflow", "claude", "cloudfront"]
draft: false
---

A year ago I wrote about building this site with an LLM agent in the terminal. The honest summary of that post: the agent wrote a lot of code quickly, and I read it carefully.

Since then, 77 commits. In one 22-hour stretch this week the site went from **zero automated tests to 484**, migrated **two Astro major versions**, replaced its image pipeline, and shipped an edge feature.

The interesting part isn't the speed. It's that the speed came *from* the tests, not despite them — and that the tests earned their keep mostly by catching the AI, including on things it had confidently researched.

---

## What changed in the stack

The bones are the same: Astro, S3, CloudFront, Route 53, all in Terraform. What's new:

- **Astro 5 → 7.** Content collections moved to `src/content.config.ts`, `entry.slug` became `entry.id`, `entry.render()` became `render(entry)`, and Zod 4 landed.
- **`remark-gfm` deleted.** Astro 7's native Markdown processor handles GFM, so the plugin was doing nothing.
- **Images out of git.** They live in S3 with a committed `media-manifest.json` recording hashes and dimensions. Purging the old blobs from history took `.git` from **6.6 MB to 708 KB**.
- **484 checks** across five suites: Vitest units, build-integration assertions on `dist/`, Playwright across three browsers, pytest+boto3 against live AWS, and CloudFront Functions run in AWS's own engine.
- **`npm audit`: 25 vulnerabilities → 6**, the critical one gone.

---

## The workflow shift

Last year the loop was *generate, then read*. Now it's *generate, then run*.

That sounds like a small difference. It isn't, because reading code is a weak test of whether it works, and it's an especially weak test of AI-written code — which is fluent, plausible, idiomatic, and wrong in ways that look right.

A concrete example. The agent wrote this, and I'd have signed it off on a read:

```astro
<img src={frontmatter.heroImage} alt="" />
```

`heroImage` is `"images/hero.png"`. On `/entries/my-post/` the browser resolves that against the current URL and requests `/entries/my-post/images/hero.png`. **404, on every article, for months.** The OG meta tag a few lines above built the path correctly, so the metadata was right while the visible image was broken.

No amount of careful reading catches that. One integration test asserting "every referenced image exists in `dist/`" catches it immediately — and did, the day it was written.

---

## What the tests actually caught

Not hypotheticals. This week:

**A dead image reference.** `sample-project.md` pointed at `/images/placeholder-project.png`, which never existed. Every listing page fired a 404 that an inline `onerror` handler politely hid.

**A silent regression in the Astro 7 upgrade.** `astro-favicons` still generated all 19 icon files — but injected zero `<head>` tags, because it works through a Vite plugin and Astro 7 moved to Vite 8. No build warning. The files were all present; the links were all gone. A test asserting the tags exist caught what a test asserting the *files* exist would have missed.

**A CI check that would have failed on a healthy repo.** I wired `media-check --offline --strict` into CI, then simulated CI properly — no images, no credentials — and it failed. "Not pulled yet" was a *warning*, and `--strict` promotes warnings. The exact state CI is always in would have broken the build.

**A deploy gate that silently blocked deploys.** The first version tested the CloudFront function by publishing to its `DEVELOPMENT` stage. Terraform compares against that stage — so priming it made `terraform plan` report *"No changes"* while the `LIVE` stage serving traffic stayed stale. The gate would have blocked the very change it was validating.

That last one is my favourite, because it was caught by noticing that `terraform plan` said something implausible. Which is a kind of test too.

---

## Where the AI was confidently wrong

This is the part worth being blunt about.

Several times the agent produced well-sourced, plausible research that was **wrong**, and only running the thing revealed it.

**"CloudFront Functions can't use `String.includes`."** Stated with confidence, backed by real documentation. I probed the actual runtime:

```
String.includes=true   Array.some=true   startsWith=true   Object.assign={"a":1}
```

All fine. The constraint is ES5.1 **syntax** — `const`, arrow functions, template literals — not the standard library. And the evidence had been sitting in the repo the whole time: the existing URL-rewrite function had been calling `uri.includes('.')` in production since day one.

**"Publishing validates the function."** It doesn't. I published a function using `const` and a template literal. It was *created successfully*. The error only appeared when it ran:

```
SyntaxError: Token "const" not supported in this version
```

An invalid function sits there quietly until the first request, and then every request 503s.

**A crawler list containing `googlebot`.** An early plan for AI-friendly content had a User-Agent list that included Google and Bing, rewriting them to a JSON bundle. Shipped, it would have served search engines a blob of JSON instead of the website. That wasn't a coding error — the code would have done exactly what it said. It was a *specification* error, and a perfectly green test suite written from that spec would have passed while de-indexing the site.

The pattern: **fluency is not accuracy, and a citation is not a verification.** The fix isn't to trust the AI less in general. It's to make "run it" cheaper than "argue about it."

---

## Why this makes iteration faster, not slower

The intuition is that tests slow you down. In an AI loop the opposite holds, for three reasons.

**The agent can check its own work.** A test suite is a machine-readable definition of "done". Without one, every change ends with a human reading a diff. With one, most changes end with the agent noticing it broke something and fixing it before I ever see it.

**Big changes stop being scary.** Migrating two Astro majors touched content config, route params, the render API and the schema. With 266 tests already in place it was a mechanical afternoon: change, run, read the failures, fix. Without them it would have been a week of clicking round the site hoping to spot what broke.

**Verification beats debate.** When the agent and I disagreed about the CloudFront runtime, the resolution wasn't a better argument — it was a throwaway function and thirty seconds:

```bash
aws cloudfront test-function --name probe --stage DEVELOPMENT \
  --if-match "$ETAG" --event-object fileb://event.json
```

Every minute spent making verification cheap pays back the moment there's a question of fact.

---

## The rules that survived contact

**Extract logic so it can be tested.** Vitest can't render `.astro` files, and `astro:content` is a virtual module that only exists during a build. So the logic lives in plain modules under `src/utils/` and the components are thin wrappers. This is good design anyway; being forced into it by testability is a bonus.

**Test the real thing where you can.** Unit tests on Node can't catch an ES5.1 violation, because Node supports everything. `aws cloudfront test-function` runs the real engine. Live boto3 assertions catch infrastructure drift that no local test can see. Where the real thing is reachable, reach for it.

**Write the failing test first, and watch it fail.** Not ceremony. When I flipped DMARC to `p=reject`, I wrote the assertion, ran it, watched it fail with `+ quarantine`, changed the record, then watched it pass. That sequence is the only thing that proves the test can fail — a test you've never seen red is a test you haven't tested.

**Simulate the environment you don't have.** Both CI bugs above were found by deleting the local files and running as CI would. Neither was theoretical, and neither would have shown up any other way.

**Record why, not just what.** Every task file here carries a log of decisions and the reasoning behind them. When an agent picks the work up three weeks later, that context is the difference between continuing and re-litigating.

---

## The honest caveat

This site has three posts. It has 484 tests, an S3 media pipeline with hash reconciliation, an edge content-negotiation function, and infrastructure tests running against live AWS.

The engineering is a long way ahead of the writing, and I know it. Some of that is legitimate — the site *is* the workbench, and this post exists because the building was the interesting part. But if you take one thing from this, don't take "add 484 tests to your blog."

Take this instead: **AI writes code faster than you can read it, so the bottleneck moves to verification.** Whatever makes verification cheap in your project — that's the thing worth building first. Everything downstream of it gets faster.

Source: [github.com/jgreen01/jgreen.one](https://github.com/jgreen01/jgreen.one).
