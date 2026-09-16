# Decide on the agent-discovery protocols

**Priority**: LOW
**Status**: TODO — a decision, not an implementation
**Created**: 2026-09-15
**Updated**: 2026-09-15

## Description

An isitagentready.com scan scored jgreen.one **20/100, Level 1**. Eight of the
twelve checks sit in "API, Auth, MCP & Skill Discovery", where the site scores
0/8. This task decides what to do about those eight and records the reasoning.

**The question that settles each one is not "is the site static?" — it is
"does the thing this metadata points at actually work?"**

That distinction matters because a read-only JSON API served as static files
from a CDN *is a real API*. There is nothing fake about it. Plenty of
production APIs are exactly that. If the site published
`/api/entries.json` and a catalog pointed at it, every claim in that catalog
would be true, and an agent following it would get what it was promised.

What cannot be made true with static files is metadata describing
*infrastructure*: an authorization server that issues tokens, or an MCP
transport endpoint that holds a session. Publishing those means advertising a
`token_endpoint` that returns 404. An agent that follows it has been sent
somewhere broken — worse than finding nothing, because finding nothing costs it
one request and a dead endpoint costs it a retry loop and a wrong conclusion
about the site.

So the eight split three ways.

## Group A — can be genuinely real with static files

These are worth considering on their merits, because nothing about them
requires pretending.

| Check | What would make it true |
|---|---|
| **A static JSON API** | `/api/entries.json`, `/api/tags.json` generated from the collection, exactly as `llms.txt` already is |
| **API Catalog** (RFC 9727) | `/.well-known/api-catalog` as `application/linkset+json` pointing at that API. Honest the moment the API exists |
| **ARD** (`ai-catalog.json`) | entries carry an IANA media type and a URL, so `/llms.txt`, the Markdown twins and the JSON API are all legitimate entries |
| **Agent Skills index** | `type: "skill-md"` is a single static Markdown file — no code, no endpoint |

The Agent Skills finding is the one that most changes the picture. The RFC
defines two distribution types and states that "simple skills — those with only
`SKILL.md` — SHOULD use `type: 'skill-md'`". Entries need `name`, `type`,
`description`, `url` and a `digest` of the form `sha256:{64 hex}`. The scanner's
own site serves its skills this way, at
`/.well-known/agent-skills/<name>/SKILL.md`. A static site can publish real
skills.

Whether it *should* is a separate question: what would jgreen.one's skills be?
There are real candidates — the transcript pipeline, the Markdown-twin setup,
the media manifest reconciliation are all transferable practices already
documented in `guides/`. That is a content decision, not a technical one.

## Group B — cannot be true without lying

| Check | Why not |
|---|---|
| OAuth / OIDC discovery | describes an authorization server; `token_endpoint` and `jwks_uri` would 404 |
| OAuth Protected Resource | describes resources needing a token; there are none |
| Auth.md | tells an agent how to register for credentials that do not exist |
| MCP Server Card | names a transport endpoint; MCP is a live protocol, static JSON cannot serve it |
| DNS-AID | SVCB/HTTPS records advertising agent endpoints there are none of |

These are the ones where "just serve some static JSON and pretend" breaks down.
The JSON would parse and validate; the thing behind it would not exist. Worth
noting the site's own published position, which this would contradict: the
edge function branches on what a client *asks for*, never on who it claims to
be, precisely so that agents and people receive the same truthful thing.

An MCP server is not impossible here, but it needs somewhere to run. That is a
Lambda or a Worker, a runtime, and an operational surface the site does not
currently have. It would be a real project, not a metadata file.

## Group C — cannot be assessed yet

**WebMCP.** Tools are registered in client-side JavaScript, so a static site
could in principle provide real ones — a search over a static entries index
genuinely executes in the browser. But the documentation is gated behind
Chrome's early preview programme and the API is not public, so there is nothing
firm to build against. Revisit when it ships.

## Recommendation

Group A is defensible and Group B is not. But "can" is not "should": each item
in Group A is another generated artifact that has to stay in sync with the
collection, another thing in the build tests, another surface to maintain, on a
site whose stated ethos is that the infrastructure is the standard playbook and
deliberately boring.

The honest ordering:

1. **A static JSON API plus an API Catalog** is the most defensible, because it
   makes something genuinely useful — the site's content addressable as data —
   and the catalog then describes something true.
2. **ARD** costs one file and can point at what already exists today.
3. **Agent Skills** only if there is something real to teach; publishing an
   empty or contrived skill is Group B behaviour wearing Group A's clothes.
4. **Group B: no**, unless the site grows the infrastructure they describe.

None of this is urgent. The score is a poor summary of a content site, and the
signals that matter already hold.

## What the scan got right, and what it did not

Right: no `Link` headers, no Content Signals, no twin advertised on the
homepage. Those are tasks B and C.

Not right, or at least misleading:

- **"Site does not support Markdown for Agents."** It was tested against `/`,
  which has no twin. `/entries/this-site/` returns
  `text/markdown; charset=utf-8` for `Accept: text/markdown`. The feature works;
  the scanner tried a URL where it does not apply. Task C covers making that
  discoverable.
- **The `cf-ray` headers in the report are the scanner's own infrastructure,
  not this site's.** jgreen.one returns `server: AmazonS3`,
  `via: …cloudfront.net` and `x-amz-cf-id`, with no `cf-ray`. Verified
  2026-09-15.

That second point matters because the article that prompted this
(saikirankatayath, "Gemini Failed to Read My Portfolio") is entirely about
Cloudflare: Managed robots.txt overriding the origin file, the Block AI bots
setting, and Bot Fight Mode challenging crawlers. **None of it applies here.**
There is no Cloudflare in front of jgreen.one. The equivalent layer, the WAF,
was audited on 2026-09-14: default action Allow, one rate-limit rule, no
bot-mitigation rule set, and every AI crawler returning 200.

## A note on the score itself

20/100 is a weak summary for this site, because the denominator is mostly
API-shaped. A static personal site cannot reach a high score without pretending
to be an application. The author of the Medium article reached the same
conclusion and deliberately stopped at 64 rather than publish dummy OAuth
metadata.

Useful signals from the scan already hold: `robots.txt` valid and permissive to
eight named AI bots, a valid sitemap, rules found for every major crawler. What
actually matters for this site is measured better by `npm run crawlers`
(150/150 against production) and by the WAF logs, which show verified Googlebot
from `66.249.74.x` fetching `/robots.txt` daily.

## Acceptance Criteria

- [ ] Decide Group A item by item — each is a yes/no on value, not on honesty
- [ ] If the JSON API is wanted: generated from the collection like `llms.txt`,
      with the same build-integration guarantees, and an API Catalog at
      `/.well-known/api-catalog` as `application/linkset+json` describing it
- [ ] If ARD is wanted: `/.well-known/ai-catalog.json` with
      `Access-Control-Allow-Origin: *`, listing only resources that exist
- [ ] If Agent Skills is wanted: real, useful skills with correct
      `sha256:{64 hex}` digests, and a test that each digest matches the file
      it names — a stale digest is a broken promise
- [ ] Group B stays declined until the site has the infrastructure. Record the
      trigger: an API needing auth, or a running MCP server
- [ ] Revisit WebMCP when its documentation leaves early preview
- [ ] Whatever is declined, record it somewhere a future scan will not reopen

## Notes

Nothing here is blocked; it needs a decision rather than work. Left in `todo/`
rather than filed to the boneyard because filing happens only when Jon asks.

## Log

- 2026-09-15 Created from an isitagentready.com audit of jgreen.one, prompted
  by a Medium article about Cloudflare bot-blocking that does not apply to this
  stack.
- 2026-09-15 Specs read rather than assumed. The decline holds for all eight,
  but ARD was upgraded from "not applicable" to "arguable": its entries accept
  an IANA media type and a URL, so `/llms.txt` could legitimately be listed.
  Also corrected the Web Bot Auth reasoning — it concerns requests the site
  *sends*, not crawlers arriving, which is the opposite of what the scan's
  placement under Bot Access Control suggests.
- 2026-09-15 Reconsidered after Jon asked why a static JSON API would not do.
  The blanket decline was too broad. The test is not static-versus-dynamic but
  whether the metadata points at something that works, and by that test four of
  the items can be made genuinely true with static files — a read-only JSON API
  is a real API. Agent Skills was the clearest error: `type: "skill-md"` is a
  single static Markdown file. Five items still require describing auth or
  transport infrastructure that does not exist, and WebMCP cannot be assessed
  while its documentation is behind an early-preview signup.
