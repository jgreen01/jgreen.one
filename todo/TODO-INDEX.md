# TODO Index: 3 open (0 HIGH, 2 MEDIUM, 1 LOW)
*Last updated: 2026-08-31*

**Suggested order:** 5 (blocker expired) → 9 (unblocks the inert infra CI job, and upgrades task 6's interim CI check) → 3

---

## HIGH Priority

(none)

## MEDIUM Priority

- [5 mail-lockdown](5-mail-lockdown.md) — Harden DMARC (rua reporting, p=reject) after validating ProtonMail cutover
- [9 github-oidc-ci-role](9-github-oidc-ci-role.md) — Terraform an IAM OIDC provider + read-only role so CI can reach AWS without long-lived keys. Unblocks the inert `infra` CI job **and** task 6 step 0.

## LOW Priority

- [3 llm-content-pack](3-llm-content-pack.md) — Machine-readable `/_llm/*` endpoints (JSON/NDJSON/Markdown) + CloudFront bot routing

---

## Recently Resolved

- [2 aws-waf-protection](2-aws-waf-protection.md) — Done 2026-06-27. WAF v2 rate limit (1000 req/5min) on CloudFront with CW logging.

---

## Boneyard (Abandoned Tasks)

(No abandoned tasks — see `todo/boneyard/` for details)
