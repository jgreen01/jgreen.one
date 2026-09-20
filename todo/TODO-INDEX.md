# TODO Index: 3 open
*Last updated: 2026-09-19*

Completed tasks in `todo/done/`, abandoned in `todo/boneyard/`.

---

## HIGH Priority

(none)

## MEDIUM Priority

- [A add-json-ld-structured-data](A-json-ld-structured-data.md) — BLOCKED: shipped, live, and validated clean against schema.org two ways. The last check is Google's Rich Results Test, which needs a signed-in account — two minutes in a browser.
- [F search-engine-submission](F-search-engine-submission.md) — get the site into Google and Bing. Reachability for Gemini and ChatGPT is an indexing problem, not a serving one. Covers every channel, including the ones to skip.

## LOW Priority

- [E mcp-server](E-mcp-server.md) — serve the site's content as MCP tools. The one item from the audit that can be made real, and the only one needing a runtime.

---

## Recently Resolved

- [G link-the-tag-pages](G-link-the-tag-pages.md) — DONE 2026-09-19. All 22 tag pages are now linked from entry cards and article pages; no tag page is orphaned. The cull decision on the 13 single-entry tags is left open for Jon, and the build gate makes adopting it safe.
- [H json-ld-breadcrumbs-and-listings](H-json-ld-breadcrumbs-and-listings.md) — DONE 2026-09-19. `BreadcrumbList` with a real visible trail, `CollectionPage`/`ItemList` on the listings. Validated against schema.org. **Contains the only visible UI change — worth a look.**

---

## Boneyard (Abandoned Tasks)

- [D agent-discovery-protocols](boneyard/D-agent-discovery-protocols.md) — Abandoned 2026-09-16. Five of the eight would advertise auth or transport that does not exist; three could be true but were declined on cost and fit. Revive if the site grows a runtime, or for ARD if a registry ever consumes it.
- [9 github-oidc-ci-role](boneyard/9-github-oidc-ci-role.md) — Abandoned 2026-08-31. A standing GitHub→AWS trust relationship is more surface area than it buys on a solo site where `pytest tests/infra` takes five seconds. See `todo/boneyard/README.md`.
