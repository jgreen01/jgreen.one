# Declare AI usage preferences in robots.txt

**Priority**: LOW
**Status**: IN_PROGRESS — implemented and tested locally, not deployed
**Created**: 2026-09-15
**Updated**: 2026-09-15

## Description

`robots.txt` says which agents may fetch the site. It does not say what they
may do with what they fetch. The site already argues its position in prose at
the bottom of the file — "there is nothing here to withhold from a training
crawler and nothing to be compensated for" — and names all three kinds of agent
as welcome. This is the machine-readable form of a stance that is already
written down.

**There are two competing syntaxes and they are not compatible.** Choosing
between them is the actual work here; the edit itself is one line.

## The two syntaxes, checked 2026-09-15

### IETF AIPREF — `Content-Usage` (standards track)

Two working-group drafts, both revised 14 September 2026:

- `draft-ietf-aipref-vocab` — the vocabulary. Proposed Standard track,
  expires 18 March 2027.
- `draft-ietf-aipref-attach` — how it attaches to robots.txt and HTTP.
  Adopted WG document with an August 2026 milestone to go to the IESG.

ABNF from the attach draft:

```
rule =/ content-usage
content-usage = *WS "content-usage" *WS ":" *WS
                [ path-pattern 1*WS ] usage-pref EOL
usage-pref    = <usage preference vocabulary from [VOCAB]>
```

Canonical example, verbatim:

```
User-Agent: *
Allow: /
Content-Usage: train-ai=n
Content-Usage: /ai-ok/ train-ai=y
```

Vocabulary — three categories, values `y` or `n` only:

| Category | Meaning |
|---|---|
| `train-ai` | modifying the learned parameters of a generative model |
| `ai-use` | using the asset as model input where the user did not supply it |
| `search` | selecting assets and directing users to their location |

Two properties that matter here:

- **Scoped to a User-agent group, not file-wide.** Per the draft, each group
  applies to the crawlers named by its product token. A directive placed
  outside a group, or in only one of fourteen groups, does not mean what it
  looks like it means.
- **Absence is `unknown`, not denial.** "In the absence of a statement of
  preference, all usage categories are assigned a preference value of
  'unknown'." So doing nothing withholds nothing — which is why this is LOW.

There is no wildcard to set all three at once; each is stated or unknown.

The same vocabulary also rides on an HTTP `Content-Usage` response header, a
structured-field dictionary: `Content-Usage: train-ai=n`.

### Cloudflare — `Content-Signal` (vendor convention)

```
Content-signal: search=yes, ai-train=no, use=reference
```

Different directive name, different category names (`ai-train`, `ai-input`),
different values (`yes`/`no`), plus a fourth signal `use` taking
`immediate` / `reference` / `full`. Cloudflare places it immediately after
`User-Agent: *` and before `Allow: /`, and links contentsignals.org without
mentioning AIPREF.

Note: `draft-romm-aipref-contentsignals` — the draft contentsignals.org points
at — is **expired and archived**, and version 00 defined only vocabulary, never
syntax. The `Content-Signal:` line is Cloudflare's own invention.

## The decision

1. **`Content-Usage` only.** Standards track, actively revised, correct
   vocabulary. Invisible to the isitagentready scanner, which tests for
   Cloudflare's name.
2. **`Content-Signal` only.** Matches the scanner and Cloudflare's ecosystem,
   but is a vendor convention resting on an expired draft.
3. **Both.** They are distinct directive names, and robots.txt parsers ignore
   directives they do not recognise, so they can coexist. Costs two lines and
   some explaining.

Recommendation: **`Content-Usage`**, with `Content-Signal` added only if
matching the scanner is worth it. Following an expired vendor draft to satisfy
a third-party score is the same trap as the API-discovery checks in task D.

## Acceptance Criteria

- [x] Decide which syntax, and record why in the file's comment block
- [x] If `Content-Usage`: `train-ai=y`, `ai-use=y`, `search=y`, matching the
      prose already in the file
- [x] Placed inside **every** `User-agent` group it is meant to cover, not once
      at the top — group scoping is the easy thing to get wrong here, and
      `public/robots.txt` currently has fourteen groups
- [x] Verify the syntax against the then-current draft before writing it;
      these revise roughly every six months
- [x] `robots-parser` assertions still pass — an unrecognised directive must
      not disturb exclusion-protocol parsing for any agent
- [x] Build-integration assertion that the directive is present, permissive,
      and in every group, alongside the existing robots.txt tests
- [ ] `npm run crawlers` still 150/150 against production

## Notes

The HTTP header form would need a CloudFront response headers policy; the
distribution has none today. Not worth adding one for this alone — see the same
constraint in task C.

Came out of an isitagentready.com scan, which flagged it under Bot Access
Control. The scan's other findings are tasks C and D.

## Log

- 2026-09-15 Created from an isitagentready.com audit.
- 2026-09-15 Rewritten after reading the specs. The first draft named the
  directive `Content-Signal` with categories `ai-train`/`ai-input` and values
  `yes`/`no`, and called it an emerging standard. All of that was Cloudflare's
  convention. The standards-track directive is `Content-Usage` with
  `train-ai`/`ai-use`/`search` and `y`/`n`, it is scoped per User-agent group,
  and absence means unknown rather than refusal.
- 2026-09-15 DECIDED `Content-Usage`, the standards-track directive, and
  implemented. `Content-Signal` is deliberately absent; following an expired
  vendor draft to satisfy a third-party readiness score is the same trap task D
  declines, and the reasoning is written into the file's comment block so it is
  not reopened.

  `Content-Usage: train-ai=y, ai-use=y, search=y` now sits inside all fourteen
  groups, directly under each `Allow: /`. All three categories are stated
  because an omitted one means "unknown" rather than "yes".

  A BUG WORTH RECORDING: the first attempt inserted the directive after the
  blank line that terminates each group, leaving it orphaned and meaningless —
  and the test passed, because its group parser did not treat a blank line as a
  separator. Both were wrong. The parser now ends a group at a blank line and
  asserts that no directive sits outside one, which is what would have caught
  it. Verified the guard fires on the orphaned shape.

  VERIFIED LOCALLY: `robots-parser` reads the file with all seven sampled
  agents allowed and the sitemap intact, so the unrecognised directive does not
  disturb exclusion parsing.
