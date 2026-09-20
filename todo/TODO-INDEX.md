# TODO Index: 4 open
*Last updated: 2026-09-20*

Completed tasks in `todo/done/`, abandoned in `todo/boneyard/`.

---

## HIGH Priority

(none)

## MEDIUM Priority

- [A add-json-ld-structured-data](A-json-ld-structured-data.md) — BLOCKED: shipped, live, and validated clean against schema.org two ways. The last check is Google's Rich Results Test, which needs a signed-in account — two minutes in a browser.
- [F search-engine-submission](F-search-engine-submission.md) — get the site into Google and Bing. Reachability for Gemini and ChatGPT is an indexing problem, not a serving one. Covers every channel, including the ones to skip.

## LOW Priority

- [I redirect-www-to-apex](I-redirect-www-to-apex.md) — `www.jgreen.one` serves 200 with no redirect, so Google crawls the site under two hostnames. An optimisation, not a fix — but it edits the one file where a bug is a full outage.
- [E mcp-server](E-mcp-server.md) — serve the site's content as MCP tools. The one item from the audit that can be made real, and the only one needing a runtime.

---

## Recently Resolved

(nothing pending — see `todo/done/`)

---

## Boneyard (Abandoned Tasks)

- [D agent-discovery-protocols](boneyard/D-agent-discovery-protocols.md) — Abandoned 2026-09-16. Five of the eight would advertise auth or transport that does not exist; three could be true but were declined on cost and fit. Revive if the site grows a runtime, or for ARD if a registry ever consumes it.
- [9 github-oidc-ci-role](boneyard/9-github-oidc-ci-role.md) — Abandoned 2026-08-31. A standing GitHub→AWS trust relationship is more surface area than it buys on a solo site where `pytest tests/infra` takes five seconds. See `todo/boneyard/README.md`.
