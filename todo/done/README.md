# Done

Completed tasks live here permanently once Jon explicitly asks to move them.

## Rules

- **Never move a task here on your own.** Wait for an explicit instruction like
  "move the billing alarms task to done" or "file the done tasks." Marking
  a task DONE in the index is not permission to move it here.
- Files here are read-only history. Never edit or delete them.
  - **One exception, exercised 2026-09-20:** removing a credential or an
    account identifier. Leaving one in an archived file would make the repo
    permanently fail `npm run check:secrets`, so redaction wins over the
    read-only rule. Redact in place (`<account-id>`), never delete the file,
    and note it here.
- The task file stays in `todo/` (marked DONE) until Jon asks to file it.
  That way it remains visible in the index during review.

## How to file a task (when asked)

1. `git mv todo/<task-name>.md todo/done/<task-name>.md`
2. Remove its entry from the "Recently Resolved" section of `TODO-INDEX.md`
   (or drop it entirely if the index is getting long — the file is the record).
3. Update the index header count if needed.
4. Commit: `chore(todo): file <task-name> as done`.

## Contents

- [1 aws-billing-alarms](1-aws-billing-alarms.md) — Filed 2026-06-27. SNS + 4 CloudWatch alarms + $20/mo budget.
- [2 aws-waf-protection](2-aws-waf-protection.md) — Filed 2026-08-31. WAF v2 rate limit (1000 req/5min) + CW logging. Reconciled against the live account; rate-limit firing still unverified.
- [3 llm-content-pack](3-llm-content-pack.md) — Filed 2026-08-31. `.md` per entry + `llms.txt` + `Accept: text/markdown` edge negotiation. 73% fewer tokens; live and verified.
- [4 testing](4-testing.md) — Filed 2026-08-30. Vitest + Playwright + build integration + pytest/boto3 infra; 266 tests.
- [5 mail-lockdown](5-mail-lockdown.md) — Filed 2026-08-31. DMARC `p=reject`, stale Tutanota token removed, 18 DNS tests. Reports read and clean, but on a 2-message sample.
- [6 image-asset-management](6-image-asset-management.md) — Filed 2026-08-31. `public/media/` git-ignored, S3 durable copy, `media-manifest.json`, `media-check`/`media-push`. Step 13 history purge done 2026-08-31: `.git` 6.6M → 708K.
- [7 copyright-year-auto](7-copyright-year-auto.md) — Filed 2026-08-30. Footer `© 2025–<year>` via `src/utils/copyright.ts` + inline client bump.
- [8 package-updates](8-package-updates.md) — Filed 2026-08-30. Astro 5→7 + all deps current; `remark-gfm` removed; `npm audit` 25→5.
- [B ai-usage-preferences-robots-txt](B-ai-usage-preferences-robots-txt.md) — Filed 2026-09-16. `Content-Usage` and `Content-Signal` in all 14 groups, permissive, with a build test asserting the two vocabularies agree.
- [C advertise-the-markdown-twin](C-advertise-the-markdown-twin.md) — Filed 2026-09-16. Every page has a Markdown twin, advertised by URL convention, `rel=alternate` and a `Link` header, with a per-document `x-markdown-tokens` count.
- [G link-the-tag-pages](G-link-the-tag-pages.md) — Filed 2026-09-20. Tags linked from entry cards and article pages; all 22 tag pages reachable. Build gate asserts every tag link resolves. The cull of the 13 single-entry routes is left open.
- [H json-ld-breadcrumbs-and-listings](H-json-ld-breadcrumbs-and-listings.md) — Filed 2026-09-20. `BreadcrumbList` with a visible trail, `CollectionPage`/`ItemList` on the four listing templates, combined via `@graph`. Validated against schema.org.
