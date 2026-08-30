# TODO Index: 6 open (1 HIGH, 3 MEDIUM, 2 LOW)
*Last updated: 2026-08-27*

---

## HIGH Priority

- [4 testing](4-testing.md) — Full test stack: Vitest unit, Playwright E2E, build integration, pytest+boto3 infra validation

## MEDIUM Priority

- [5 mail-lockdown](5-mail-lockdown.md) — Harden DMARC (rua reporting, p=reject) after validating ProtonMail cutover
- [6 image-asset-management](6-image-asset-management.md) — Keep images out of git (Option A1): one gitignored `public/media/` folder + S3 backup + root `media-manifest.json` + `media-check` reconciler; `heroImage` pinned to `/media/...`; SVGs stay committed; final step = purge blobs from history
- [8 package-updates](8-package-updates.md) — Deps to current; Astro 5→7 in 3 phases (safe minors, then v6 [content.config move, slug→id, Zod 4], then v7 [Sätteri markdown swap, compressHTML]). Coordinate Phase 2 with task 6.

## LOW Priority

- [3 llm-content-pack](3-llm-content-pack.md) — Machine-readable `/_llm/*` endpoints (JSON/NDJSON/Markdown) + CloudFront bot routing
- [7 copyright-year-auto](7-copyright-year-auto.md) — Footer copyright as `© 2025–<year>`: build-time end year via `src/consts.ts` + `is:inline` client script recomputing from real clock

---

## Recently Resolved

- [2 aws-waf-protection](2-aws-waf-protection.md) — Done 2026-06-27. WAF v2 rate limit (1000 req/5min) on CloudFront with CW logging.

---

## Boneyard (Abandoned Tasks)

(No abandoned tasks — see `todo/boneyard/` for details)
