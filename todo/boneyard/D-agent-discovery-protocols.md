# Decide on the agent-discovery protocols

**Priority**: LOW
**Status**: ABANDONED
**Created**: 2026-09-15
**Updated**: 2026-09-16

## Abandoned — 2026-09-16

**Why.** The deliverable was a decision, and the decision was to do none of it.
Filing the task keeps the reasoning without leaving an open item nobody intends
to act on.

The eight checks split two ways, and the split is the part worth keeping:

- **Five cannot be made true** — OAuth/OIDC discovery, OAuth Protected
  Resource, Auth.md, the MCP Server Card and DNS-AID all describe auth or
  transport infrastructure that does not exist. Publishing them advertises
  endpoints that return 404, which costs an agent more than no endpoint at all:
  it follows the link, retries, and concludes something wrong about the site.
- **Three could be made genuinely true** — a read-only JSON API served as
  static files is a real API, an ARD catalogue could honestly list `/llms.txt`
  and the Markdown twins today, and `type: "skill-md"` is a single static
  Markdown file. These were declined on cost and on fit, not on honesty, and
  that distinction is the reason this file is worth keeping.

WebMCP could not be assessed at all: its documentation is behind Chrome's
early-preview signup.

**What would change the decision.**

- The site grows a runtime — an API needing auth, or a running MCP server
  (task E). That turns the MCP Server Card from a false claim into a true one,
  and gives DNS-AID something real to point at.
- ARD gains a registry that actually consumes it. This is the cheapest item to
  revive: one static file, honest today, listing things that already exist. It
  is the first to reconsider, and the reason it was declined is weak — doubt
  about the benefit rather than any real cost.
- The site's purpose shifts toward teaching technique rather than showing work.
  That answers Agent Skills, which is a content question rather than a
  technical one. The candidates are real and already written up in `guides/`:
  the transcript pipeline with corrections-as-data, the media-manifest
  three-way reconciliation, the Markdown-twin setup.

**What was built instead.** Nothing here, which was the correct outcome. The
same audit produced tasks B and C, both shipped: the AI usage preferences in
robots.txt, and a Markdown twin for every page. Those make true statements
about things that exist, which is the line this decision draws.

**Worth keeping regardless of this task's fate.** Two corrections recorded
below that a future reader would otherwise have to rediscover: the scan's
`cf-ray` headers are the scanner's own infrastructure and not this site's,
which is on CloudFront and has no Cloudflare anywhere; and the scan's
"does not support Markdown for Agents" finding was measured against a URL that
had no twin at the time, not a real absence.

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

## The decision, taken 2026-09-15

**Group B: declined.** OAuth/OIDC discovery, OAuth Protected Resource,
Auth.md, the MCP Server Card and DNS-AID all describe infrastructure that does
not exist. Publishing them would advertise endpoints that return 404, which
costs an agent a retry loop and a wrong conclusion about the site. Revisit only
if the site grows an API needing auth, or a running MCP server — which is
task E.

**Group A: declined for now, on cost rather than honesty.** All four could be
made genuinely true, and that distinction is worth keeping: a read-only JSON
API served as static files is a real API, and `type: "skill-md"` is a real
skill. But each adds a generated artifact to keep in sync, build assertions to
maintain, and a surface to explain, on a site whose stated position is that its
infrastructure is the standard playbook and deliberately boring.

The specific reasoning per item:

- **JSON API + API Catalog.** The content is already addressable as data —
  every page now has a Markdown twin, and `/llms.txt` indexes them. A JSON
  feed would be a second representation of the same thing with no demonstrated
  reader. If task E goes ahead, an MCP server subsumes this properly, and the
  catalog then has something better to point at than a hand-rolled feed.
- **ARD.** One file, and it could honestly list `/llms.txt` and the twins
  today. Declined only because the protocol is early and no registry is known
  to consume it; this is the cheapest to revisit and the first to reconsider.
- **Agent Skills.** There are plausible candidates — the transcript pipeline,
  the media-manifest reconciliation, the Markdown-twin setup are all real
  transferable practices already written up in `guides/`. But publishing them
  as skills is a content decision about what the site is for, not a technical
  one, and a contrived skill published to fill the slot would be Group B
  behaviour wearing Group A's clothes.

**Group C: WebMCP.** Still gated behind Chrome's early preview; nothing to
build against. Revisit when the documentation is public.

**What was done instead**, from the same audit: tasks B and C, both of which
make true statements about things that exist. That is the line this decision
draws.

## Acceptance Criteria

- [x] Decide Group A item by item — each is a yes/no on value, not on honesty
- [ ] If the JSON API is wanted: generated from the collection like `llms.txt`,
      with the same build-integration guarantees, and an API Catalog at
      `/.well-known/api-catalog` as `application/linkset+json` describing it
- [ ] If ARD is wanted: `/.well-known/ai-catalog.json` with
      `Access-Control-Allow-Origin: *`, listing only resources that exist
- [ ] If Agent Skills is wanted: real, useful skills with correct
      `sha256:{64 hex}` digests, and a test that each digest matches the file
      it names — a stale digest is a broken promise
- [x] Group B stays declined until the site has the infrastructure. Record the
      trigger: an API needing auth, or a running MCP server
- [x] Revisit WebMCP when its documentation leaves early preview
- [x] Whatever is declined, record it somewhere a future scan will not reopen

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
- 2026-09-15 DECIDED. Group B declined as undeliverable without the
  infrastructure they describe. Group A declined on cost rather than honesty,
  with the reasoning recorded per item so it is not re-argued from a future
  scan result. ARD is the first to reconsider; Agent Skills needs a content
  decision before a technical one; the JSON API is better served by task E if
  that goes ahead. Nothing was implemented, which is the correct outcome for a
  task whose deliverable was a decision.
- 2026-09-16 Filed to the boneyard as-is. The decision stands and nothing was
  built. Kept rather than deleted because the useful part is the reasoning: a
  future scan will report the same 0/8 and the question would otherwise be
  re-researched from scratch. Revival triggers are recorded at the top of the
  file.
