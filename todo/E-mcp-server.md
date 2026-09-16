# Serve the site over MCP

**Priority**: LOW
**Status**: TODO — a project, not a config change
**Created**: 2026-09-15
**Updated**: 2026-09-15

## Description

Expose the site's content as an MCP server at `/mcp`, so an agent can search
and fetch entries as tools rather than by scraping pages.

The site's whole argument is that it is built to be read by machines — Markdown
twins, `/llms.txt`, content negotiation at the edge. An MCP server is the
logical end of that thesis and would be a genuine differentiator: almost no
personal site has one.

**This is the only item from the isitagentready audit (task D, Group B) that
can be made real, and it is the one that requires a runtime.** It would be the
first server-side code on the site.

## Why it is now tractable

Protocol revision **2026-07-28** changed Streamable HTTP in two ways that
matter here:

- **Protocol-level sessions were removed.** There is no `initialize` handshake
  and no `Mcp-Session-Id` to track.
- **The GET stream endpoint was removed.**

A server is therefore a single POST endpoint with no state between calls. And
SSE is optional: for a JSON-RPC *request*, the server **MUST** return either
`Content-Type: application/json` (a single JSON object) or
`text/event-stream`. Plain JSON is fully conformant, and every tool here
returns immediately, so there is no reason to stream.

That makes this a stateless request/response function — about as simple as
serverless gets.

## Specs (rolling drafts — re-read before starting)

- [Transports overview](https://modelcontextprotocol.io/specification/draft/basic/transports)
- [Streamable HTTP](https://modelcontextprotocol.io/specification/draft/basic/transports/streamable-http)
- [Tools](https://modelcontextprotocol.io/specification/draft/server/tools)
- [Docs index for agents](https://modelcontextprotocol.io/llms.txt)
- Server Card: [modelcontextprotocol#2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) (SEP-1649, still in review)

These are `draft` URLs and move. Everything below was read on 2026-09-15 and
should be re-checked rather than trusted.

## Transport requirements

The server **MUST** provide a single endpoint path supporting POST, e.g.
`https://jgreen.one/mcp`.

**Security — normative:**

1. Servers **MUST** validate the `Origin` header on all incoming connections to
   prevent DNS rebinding attacks. If present and invalid, respond **403**; the
   body **MAY** be a JSON-RPC error response with no `id`.
2. Servers **SHOULD** implement proper authentication.
3. (Localhost binding does not apply to a hosted deployment.)

**Request handling:**

| Case | Required response |
|---|---|
| JSON-RPC *request* | `200` with `application/json` or `text/event-stream` |
| JSON-RPC *notification*, accepted | `202 Accepted`, no body |
| Unknown method | `404` + JSON-RPC error `-32601` |
| Unsupported protocol version | `400` + `UnsupportedProtocolVersionError` listing supported versions |
| Header/body mismatch or missing required header | `400` + JSON-RPC error `-32020` (`HeaderMismatch`) |
| GET or DELETE to the endpoint | `405 Method Not Allowed` |
| `Mcp-Session-Id` header present | ignore; do not mint or echo |
| `Last-Event-ID` header present | ignore; streams are not resumable |

**Required request headers**, which the server must validate against the body:

- `MCP-Protocol-Version` — must equal
  `_meta["io.modelcontextprotocol/protocolVersion"]` in the body
- `Mcp-Method` — must equal `method`
- `Mcp-Name` — must equal `params.name` (or `params.uri`), for `tools/call`,
  `resources/read` and `prompts/get`

Header values may arrive Base64-wrapped as `=?base64?…?=` and **MUST** be
decoded before comparison. The header/body validation exists so an intermediary
routing on headers cannot disagree with a server executing on the body — worth
implementing properly rather than trusting the header.

## Tools

Declare the capability:

```json
{ "capabilities": { "tools": { "listChanged": false } } }
```

`listChanged: false` is honest here — the tool set is fixed at build time.

Proposed tools, all read-only over content that already exists:

| Tool | Purpose |
|---|---|
| `search_entries` | full-text search over titles, descriptions, tags and body |
| `list_entries` | list entries, optionally filtered by tag or kind |
| `get_entry` | return an entry's Markdown twin |
| `get_transcript` | return a talk transcript |

Naming rules: 1–128 characters, case-sensitive, only `A-Za-z0-9_-.`, unique
within the server.

`inputSchema` **MUST** be a valid JSON Schema object. For a tool with no
parameters use `{ "type": "object", "additionalProperties": false }`.

Where a tool returns an entry, prefer a `resource_link` content item pointing
at the existing `.md` twin over inlining the whole body — the twin is already
generated, already served, and already the canonical machine representation:

```json
{ "type": "resource_link",
  "uri": "https://jgreen.one/entries/this-site/index.md",
  "name": "this-site",
  "mimeType": "text/markdown" }
```

Tools returning structured data **SHOULD** declare an `outputSchema`, and if
they do, the server **MUST** return conforming `structuredContent` — plus the
same JSON serialised in a text block for backward compatibility.

Two distinct error paths, and they are not interchangeable: an unknown tool is
a **protocol error** (JSON-RPC `-32602`), while a bad argument is a **tool
execution error** returned in the result with `isError: true`, because a model
can read that and retry.

Tool order **SHOULD** be deterministic so clients can cache the list.

## Architecture on this stack

**Lambda with a Function URL, behind a CloudFront ordered cache behaviour for
`/mcp`.** The distribution currently has **zero** ordered behaviours, so this
would be the first, alongside a second origin.

Lambda@Edge is the alternative and is worse here: no environment variables,
tighter size limits, must live in us-east-1, and harder to debug.

The function should be thin. Build a search index at build time, embed it in
the bundle, and let the handler do lookups in memory — no S3 reads, no
cold-start fetch, no database. The same generator that produces `/llms.txt`
already walks the collection.

**Caching:** POST is not cached by CloudFront by default, which is correct
here. Do not try to cache it.

## Security for this deployment specifically

- **`Origin` validation is a MUST.** Decide the allowlist deliberately; a
  public read-only server may accept absent `Origin` (non-browser clients) but
  must still reject a present-and-wrong one with 403.
- **Authentication is a SHOULD, and skipping it is defensible here** — every
  byte the server returns is already public on the same domain. That reasoning
  should be written down, because "no auth" looks like an oversight otherwise.
- **Rate limiting.** The spec says servers **MUST** rate limit tool
  invocations. The WAF rule is 1000 requests / 5 minutes per IP across the
  whole site, which is a blunt instrument for a POST endpoint that does work.
  A tighter rule scoped to `/mcp` is warranted.
- **Input validation.** The spec requires validating all tool inputs and
  sanitising outputs. A search string reaching a regex is the obvious hazard.
- This is the first endpoint on the site that accepts a request body. The
  attack surface genuinely changes.

## The honest costs

- **It contradicts something the site publishes about itself.**
  `src/content/entries/this-site.md` says "No server, no database, no runtime
  dependencies." That sentence would need rewriting, and the project page would
  need to explain the trade deliberately rather than quietly drop the claim.
- First runtime: a new deploy path, new failure modes, cold starts, and
  `pytest tests/infra` would want to cover the function, its URL and the new
  behaviour.
- The Server Card discovery file is **still in review** (PR 2127), so its shape
  may change after this is built.
- Marginal content value: an agent that can already fetch `/llms.txt` and
  follow links gets most of this. What MCP adds is structured search and
  invocability inside MCP clients.

**Do this because it is interesting and worth writing about, not to move a
scanner's score.** If it is not worth a post, it is not worth the runtime.

## Acceptance Criteria

- [ ] Re-read the draft specs; record the protocol version implemented against
- [ ] Single POST endpoint at `/mcp`; GET and DELETE return 405
- [ ] `Origin` validation with a deliberate allowlist; present-and-invalid → 403
- [ ] Header/body validation for `MCP-Protocol-Version`, `Mcp-Method` and
      `Mcp-Name`, including Base64 sentinel decoding, → 400 `-32020` on mismatch
- [ ] Unknown method → 404 `-32601`; unsupported version → 400 with the
      supported list
- [ ] Notifications → 202 with no body
- [ ] `tools/list` returns a deterministic, complete list; `tools/call` works
      for each tool
- [ ] Protocol errors and tool execution errors used correctly and distinctly
- [ ] Search index generated at build time from the `entries` collection, the
      same source as `/llms.txt`, with a build assertion that every entry
      appears
- [ ] Unit tests for the JSON-RPC layer and each tool, hermetic, no network
- [ ] Infra tests for the Lambda, its Function URL and the `/mcp` cache
      behaviour
- [ ] A `/mcp`-scoped WAF rate rule, tighter than the site-wide one
- [ ] `/.well-known/mcp/server-card.json` **only once the endpoint is live** —
      the card must never describe an endpoint that is not listening
- [ ] Verified against a real MCP client, not only unit tests
- [ ] `this-site.md` updated: the "no server, no runtime dependencies" claim is
      no longer true
- [ ] Decide whether `resources` and `prompts` are also worth exposing, or
      whether tools alone are the right scope

## Notes

Blocked on nothing; it is a question of appetite. If it goes ahead, task D's
MCP Server Card moves from Group B (cannot be true) to Group A (true), and
DNS-AID becomes meaningful for the first time, since `_mcp._agents.jgreen.one`
would finally have something to point at.

Scope discipline: tools only to begin with. `resources`, `prompts`,
`subscriptions/listen` and the MRTR input-request flow are all optional and
none are needed to serve a read-only content site.

## Log

- 2026-09-15 Created after reading the current draft specs. Grew out of task D,
  where the MCP Server Card was declined as undeliverable without a runtime —
  true, but the runtime turns out to be small now that protocol sessions have
  been removed and a plain JSON response is conformant.
