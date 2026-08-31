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

- [3 llm-content-pack](3-llm-content-pack.md) — Serve `.md` per entry via `Accept: text/markdown` content negotiation (~80% fewer tokens). **Original UA-routing design withdrawn 2026-08-31 — it was cloaking and would have served Googlebot JSON.**

---

## Recently Resolved

(nothing pending — see `todo/done/`)

---

## Boneyard (Abandoned Tasks)

(No abandoned tasks — see `todo/boneyard/` for details)
