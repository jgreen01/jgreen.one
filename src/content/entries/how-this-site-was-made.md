---
title: "How This Site Was Built: A Look Under the Hood"
description: "A technical deep-dive into the infrastructure, tools, and AI-assisted workflow used to create this website."
pubDate: 2025-09-21
kind: "blog"
heroImage: "images/how-this-website-was-built.png"
tags: ["astro", "terraform", "aws", "tailwind", "gemini", "cloudfront", "s3", "iac"]
draft: false
---

This website’s minimal look sits atop a modern, automated, and AI-assisted build pipeline. Here’s the stack and the workflow that made it happen.

## The Foundation: Infrastructure as Code (Terraform)

All infrastructure lives in Terraform—versioned, repeatable, and easy to recover. The site runs on a serverless AWS stack optimized for security, speed, and low cost:

- **Amazon S3 (private):** Stores static assets (HTML, CSS, JS). The bucket is **not public**; access is restricted to CloudFront via **Origin Access Control (OAC)** and a bucket policy. Public access is also explicitly blocked at the bucket level.
- **Amazon CloudFront:** Global CDN for low-latency delivery. Uses CloudFront compression and a response headers policy for security headers. A **CloudFront Function** performs lightweight URL rewrites so `/about` transparently serves `/about/index.html`.
- **AWS Certificate Manager (ACM):** Manages the TLS cert for HTTPS on the custom domain.
- **Amazon Route 53:** Route 53 A/AAAA **alias** records route `jgreen.one` to the CloudFront distribution.

From code to live infra is a three-step flow:

```bash
terraform init && terraform plan && terraform apply
```

### Snippet: CloudFront Function for "pretty" URLs

```js
// viewer-request function in infra/live/function.js
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Check whether the URI is missing a file name (ends with /)
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    }
    // Check whether the URI is missing a file extension (e.g., /about instead of /about.html)
    else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
```

### Snippet: OAC + S3 bucket policy (Terraform)

```hcl
// From infra/live/cloudfront.tf
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.domain}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "oac_read" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.oac_read.json
}
```

---

## The Frontend: Static, Fast, and Maintainable with Astro

The site is built with [Astro](https://astro.build), which ships **zero JS by default** and hydrates only the interactive “islands” you opt into—keeping pages fast as the site grows. In the post layout, Markdown is wrapped with `class="prose dark:prose-invert"` so headings, lists, and code blocks get consistent styling.

**Highlights**

* **Content Collections:** Type-safe, schema-enforced content (blog posts, projects) via `src/content/config.ts` so every entry stays consistent.
* **Component Architecture:** Reusable Astro components for layouts and UI.
* **Tailwind CSS + SCSS:** Utility-first styling with a thin SCSS layer. A small **design-tokens** file (CSS variables) powers light/dark theming, and `@tailwindcss/typography` makes Markdown (like this post) read nicely out of the box.

### Snippet: Content Collections schema

```ts
// src/content/config.ts
import { defineCollection, z } from "astro:content";

const entries = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string().describe("Short, human-readable title"),
    description: z.string().max(160).describe("1–2 sentence summary for cards & SEO"),
    pubDate: z.coerce.date().describe("Publish date (YYYY-MM-DD)"),
    updatedDate: z.coerce.date().optional().describe("Last updated date, optional"),
    kind: z.enum(["project", "blog"]).default("blog"),
    tags: z.array(z.string()).default([]).describe("Keywords like 'ai', 'ml', 'astro'"),
    heroImage: z.string().optional().describe("Path in /public or external image URL"),
    draft: z.boolean().default(false)
  }),
});

export const collections = { entries };
```

### Snippet: Tailwind config with Typography

```js
// tailwind.config.mjs
import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: [
    "./src/**/*.{astro,html,js,ts,jsx,tsx,md,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-color)',
        foreground: 'var(--text-color)',
        accent: 'var(--accent-color)',
        muted: 'var(--muted-color)',
      },
    }
  },
  plugins: [typography]
}
```

### Snippet: Design tokens (light/dark via CSS variables)

```css
/* From src/styles/global.scss */
:root {
  --bg-color: #f9f7c7;
  --text-color: #362827;
  --accent-color: #f6780a;
  --muted-color: #6e797f;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-color: #1f2429;
    --text-color: #efe6dd;
    --accent-color: #38bdf8;
    --muted-color: #8f9aa1;
  }
}
```

### Snippet: SVG rendering quirk fix

```css
/* From src/styles/global.scss */
--ink: #574335;
--skin: oklch(0.94 0.035 75);
--halo: color-mix(in oklab, var(--accent-color) 80%, white 20%);
@media (prefers-color-scheme: dark){
    --halo: color-mix(in oklab, var(--accent-color) 70%, var(--bg-color) 30%);
}
```

> The `Avatar.astro` component parses the SVG at build time, allowing CSS to style the `halo`, `skin`, and `ink` groups via variables for full theme integration.

---

## The Workflow: AI-Assisted Development (CLI Agent)

A distinctive part of the build was using an LLM agent (**Google Gemini**) directly in the command line, guided by a strict operating manual (`GEMINI.md`). In practice that meant:

* **Structured Prompting:** I framed high-level goals and concrete tasks; the agent handled the grunt work and scaffolding.
* **Tool-Based Execution:** The agent read and wrote files, ran shell commands, and searched docs—always within sandboxed tools.
* **Automated Quick Notes:** Every action and observation landed in time-stamped **quick notes**, leaving a searchable trail of decisions and fixes.
* **Iterative Debugging:** For CSS conflicts, SVG rendering quirks, or IAM/OAC permission gotchas, we proposed fixes, executed them, and verified outcomes—all with tight human oversight.

### Snippet: Example quick notes (trimmed)

```text
- 2025-08-16 19:05 PDT ⏱️+7m | 🐛 SEO build loops | 🔧 pinned vite dep=5.4 | 🧪 build ok | ✅ guide compiles | 🔜 ship #T-2025-0816-01 | 📎 PR#42
- 2025-08-23 21:00 PDT ⏱️+60m | 🐛 Dark mode was not applying consistently... | 🔧 Refactored the entire theme to use CSS variables... | ✅ Applied a new minimal design system...
- 2025-08-27 09:20 UTC ⏱️+6m | 🧠 debugged svg rendering issues (inline styles, raw import, sizing, ns0 prefix) | 🔜 fix ns0 prefix in avatar.svg
```

The result: faster iteration, thorough documentation “for free,” and fewer regressions—without sacrificing control or code quality.

---

If you’re curious about specifics (Terraform snippets, the CloudFront Function, or the Content Collections schema), I’m happy to add a short appendix in a follow-up post.

The complete source code for this website, including the infrastructure, is available on GitHub: [https://github.com/jgreen01/jgreen.one](https://github.com/jgreen01/jgreen.one).
