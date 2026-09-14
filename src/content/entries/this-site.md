---
title: "jgreen.one: The Site as a Workbench"
description: "A static site on AWS built the way a production one would be, with a Markdown twin of every page for AI agents and 639 automated checks."
pubDate: 2026-09-03
kind: "project"
heroImage: "/media/this-site.webp"
tags: ["astro", "aws", "terraform", "testing", "cloudfront", "iac"]
draft: false
---

A static site on AWS: S3 behind CloudFront, certificates, DNS, and a viewer-request function for clean URLs, all in Terraform. That part is the standard playbook, and it is standard on purpose. There is no reason to invent a new way to host a dozen pages.

Two things here are not standard. Every page has a Markdown twin that an AI agent can ask for by content negotiation at the edge. And a blog this size has 639 automated checks across four layers, which is the part I would not recommend to anyone whose site is only a site. This one doubles as the place I try a practice before using it somewhere that matters.

- **Live:** you are reading it
- **Source:** [github.com/jgreen01/jgreen.one](https://github.com/jgreen01/jgreen.one)

## The stack

Astro 7 with Tailwind v4 and TypeScript, building to static files. No server, no database, no runtime dependencies.

Everything under it is Terraform: a private S3 bucket reached only through CloudFront's origin access control, ACM certificates, Route 53 records, WAF rate limiting, billing alarms and a monthly budget. Twelve `.tf` files, one `terraform apply`.

Deploys are a script that pulls the Terraform outputs, hydrates managed media from S3, tests the edge function in AWS's own runtime, builds, syncs, and invalidates. It refuses to proceed when any of those disagree.

## Content negotiation at the edge

Every page has a Markdown twin. An agent that sends `Accept: text/markdown` to a normal article URL gets the words without the markup, about 73% fewer tokens for the same content.

A CloudFront viewer-request function does the routing. The important constraint is that it branches on **what was asked for, never on who is asking**. Inspecting the User-Agent and serving different content by client is cloaking, and search engines penalise it. Same content, different format, chosen by the client, is ordinary negotiation.

[Serving Markdown to AI Agents](/entries/serving-markdown-to-ai-agents) covers the implementation, including the two things that cost me time: publishing a CloudFront function does not validate it, and the ES5.1 limit is on syntax rather than the standard library.

## 639 checks, in four layers

| Layer | Count | What it proves |
|---|---:|---|
| Vitest units | 437 | pure logic, ~2s |
| Build integration | 38 | assertions on the real `dist/` |
| Playwright end-to-end | 121 | three browser projects, real rendering |
| pytest + boto3 | 43 | the deployed AWS resources match intent |

The layers exist because each catches things the others cannot. Unit tests run on Node, which supports far more than the CloudFront runtime, so they can never catch a syntax error that would return 503 on every request. That needs the function run in AWS's real engine, which the deploy does before it will ship.

Because `.astro` files cannot be unit-tested, non-trivial logic lives in plain modules under `src/utils/` and components stay thin wrappers. That constraint improved the design more than it cost.

[Tests Are What Make AI Iteration Fast](/entries/testing-makes-ai-iteration-fast) argues the case, with the regressions this actually caught.

## Media outside git

Images, PDFs and video live in S3, not in the repository. Git keeps only `media-manifest.json`, recording each asset's path, size, SHA-256, dimensions and what references it.

`media-check` reconciles three places at once: the local working copy, the bucket, and the manifest. It distinguishes a local edit from a bucket drift from a broken reference in a post, and the deploy runs it before building so a clean checkout cannot publish a site with its images missing.

## Talk transcripts

A generator turns a caption track into a readable transcript: cues merged into paragraphs, speaker turns resolved, disfluencies removed, every paragraph deep-linked into the recording at that second.

The part I would reuse elsewhere is that corrections are **data, not edits**. Passages no general rule can fix live as find-and-replace pairs beside the transcript and are reapplied on every regeneration, so fixing a rule never costs the hand corrections. A pair that stops matching is reported rather than silently dropped.

[The transcripts guide](https://github.com/jgreen01/jgreen.one/blob/main/guides/transcripts.md) documents the whole pipeline.

## What it is actually for

A personal site is the best place to adopt a practice before you are certain it is worth the trouble. Nothing here is theoretical. Every piece runs in production on a real domain behind a real CDN, and the cost of learning something the hard way is a redeploy rather than an incident.

The checks earn their keep quietly. A hero image path that resolved against the wrong URL, and dates rendering a day early for anyone west of Greenwich, were both caught by a test rather than by a reader. That is the arrangement working exactly as designed.

What it buys is pace. A change can be written, checked across four layers and deployed within the hour, because "did I break something" is a question the repository answers rather than one I have to keep in my head. Confidence like that is what makes small, frequent changes possible, and small frequent changes are what keep a system easy to work on.

None of it is visible to a reader, which is rather the point of infrastructure. The site loads fast, the links work, and the machinery underneath stays out of the way.
