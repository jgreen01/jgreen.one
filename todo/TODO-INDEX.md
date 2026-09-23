# TODO Index: 3 open
*Last updated: 2026-09-22*

Completed tasks in `todo/done/`, abandoned in `todo/boneyard/`.

---

## HIGH Priority

(none)

## MEDIUM Priority

- [F search-engine-submission](F-search-engine-submission.md) — get the site into Google and Bing. Reachability for Gemini and ChatGPT is an indexing problem, not a serving one. Covers every channel, including the ones to skip.
- [K dns-records-in-terraform](K-dns-records-in-terraform.md) — **DONE, awaiting Jon: commit, push.** Test email passed SPF/DKIM/DMARC. All eight hand-made records imported, no DNS change (zone identical to the backup); guard test added. ⚠️ Run Terraform only from this working copy until `dns.tf` is pushed.

## LOW Priority

- [E mcp-server](E-mcp-server.md) — serve the site's content as MCP tools. The one item from the audit that can be made real, and the only one needing a runtime.

---

## Recently Resolved

(nothing pending — see `todo/done/`)

---

## Boneyard (Abandoned Tasks)

- [D agent-discovery-protocols](boneyard/D-agent-discovery-protocols.md) — Abandoned 2026-09-16. Five of the eight would advertise auth or transport that does not exist; three could be true but were declined on cost and fit. Revive if the site grows a runtime, or for ARD if a registry ever consumes it.
- [9 github-oidc-ci-role](boneyard/9-github-oidc-ci-role.md) — Abandoned 2026-08-31. A standing GitHub→AWS trust relationship is more surface area than it buys on a solo site where `pytest tests/infra` takes five seconds. See `todo/boneyard/README.md`.
