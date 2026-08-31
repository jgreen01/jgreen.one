# TODO Index: 5 open (0 HIGH, 3 MEDIUM, 2 LOW)
*Last updated: 2026-08-30*

**Suggested order:** 5 (blocker expired) → 9 → 6 → 7 → 3

---

## HIGH Priority

(none)

## MEDIUM Priority

- [5 mail-lockdown](5-mail-lockdown.md) — Harden DMARC (rua reporting, p=reject) after validating ProtonMail cutover
- [6 image-asset-management](6-image-asset-management.md) — Keep images out of git (Option A1): one gitignored `public/media/` folder + S3 backup + root `media-manifest.json` + `media-check` reconciler; SVGs stay committed; final step = purge blobs from history. **Blocked on step 0** — gitignored media leaves CI with no images, failing 3 of task 4's tests
- [9 github-oidc-ci-role](9-github-oidc-ci-role.md) — Terraform an IAM OIDC provider + read-only role so CI can reach AWS without long-lived keys. Unblocks the inert `infra` CI job **and** task 6 step 0.

## LOW Priority

- [3 llm-content-pack](3-llm-content-pack.md) — Machine-readable `/_llm/*` endpoints (JSON/NDJSON/Markdown) + CloudFront bot routing
- [7 copyright-year-auto](7-copyright-year-auto.md) — Footer copyright as `© 2025–<year>`: build-time end year via `src/utils/copyright.ts` + `is:inline` client script recomputing from real clock

---

## Recently Resolved

- [2 aws-waf-protection](2-aws-waf-protection.md) — Done 2026-06-27. WAF v2 rate limit (1000 req/5min) on CloudFront with CW logging.

---

## Boneyard (Abandoned Tasks)

(No abandoned tasks — see `todo/boneyard/` for details)
