# Copy the page as Markdown

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-09-21
**Updated**: 2026-09-21

## Description

Every page already has a Markdown twin, advertised three ways — by URL
convention, by `<link rel="alternate">`, and by a `Link` header. All three are
machine-readable. **None of them is reachable by a human.**

Add a control on article pages that puts the Markdown into the clipboard, ready
to paste into an assistant.

This is the one place a reader benefits directly from the site's central
argument. The twins exist so a machine can read the page cheaply; a copy button
is that same capability handed to the person driving the machine.

## Why it belongs here rather than in task F

F is about being found by search engines. This is a feature for readers, and it
was raised while discussing F item 0c. Recording the relationship, because the
two decisions interact and the interaction is not obvious.

### It makes 0c *more* necessary, not less

The twins are currently near-undiscoverable: not in the sitemap, no `<a href>`
anywhere, only a `Link` header. **A visible link changes that deliberately** —
which is exactly when the "index the HTML, not this" signal has to be in place,
or Google is invited to find 37 near-duplicates of pages it already has.

So ship this *with* `X-Robots-Tag: noindex` on the `.md` responses, not instead
of it. They point the same way:

- `noindex` does **not** prevent fetching. It cannot — the crawler has to fetch
  the response to read the header. Content negotiation, ClaudeBot, GPTBot and
  this button are all unaffected.
- What it prevents is narrow: `/entries/x/index.md` appearing as a *separate
  search result* competing with the HTML page for the same words.

An alternative worth knowing: `Link: rel="canonical"` from the `.md` to the HTML
is more semantically precise — it consolidates signals rather than discarding
them, and is what Google recommends for alternate formats such as PDFs. Prefer
`noindex` here anyway: there is no link equity flowing to these URLs to
consolidate, and a `.md` should never be a search result at all.

## The trap this pattern is known for

The established failure is a **silently dead button**. `navigator.clipboard`
is unavailable or rejects — an in-app browser, a WebView, a denied permission —
and the click does nothing at all, with no feedback. The reader concludes the
site is broken. See
[blume#240](https://github.com/haydenbleasel/blume/issues/240), which is exactly
this bug in a shipped implementation.

**Design for the failure first**, then the happy path.

### Progressive enhancement is the answer, and it is also the SEO answer

Render a real `<a href="…/index.md">` in the HTML. Upgrade it to a copy control
with JavaScript. That gives, in order:

1. **No JS** — a working link to the Markdown. Still useful.
2. **JS, clipboard works** — one click, content on the clipboard.
3. **JS, clipboard rejects** — fall back to the link's normal behaviour and say
   so, rather than swallowing the error.

It is also what makes the twin genuinely discoverable: a real anchor is
something a crawler and a screen reader can both see, where a JS-only button is
not.

## Implementation notes

### Follow the bundled-script pattern, not the mirrored one

The codebase has two precedents and they are not equal:

- `src/utils/nazar.ts` keeps the rule testable but `Base.astro` carries an
  inline script that **duplicates** it — the file says "keep the two in step",
  which is a standing invitation to drift.
- `src/pages/index.astro` uses a plain `<script>` that Astro bundles and which
  **imports directly** from `src/utils/infiniteList`. No duplication.

Use the second. The logic lives in `src/utils/` where it is unit-tested, and the
component imports it.

### Clipboard specifics

- `navigator.clipboard.writeText()` needs a **secure context** (HTTPS — fine)
  and **transient user activation**, so it must run inside the click handler.
  Do not `await` the fetch before calling it without care: in some browsers the
  activation is consumed. Fetch the Markdown first, then write, and handle the
  rejection either way.
- It returns a promise that **rejects** rather than throwing synchronously.
  `catch` is not optional; a bare `.writeText()` is precisely the dead button.
- The deprecated `document.execCommand('copy')` with a temporary textarea still
  works as a second-chance fallback. Worth including, kept behind the modern
  path.

### Suggested behaviour

- Label it for what it does: "Copy as Markdown", not an unlabelled icon.
- Confirm in place — swap to "Copied" for about two seconds — and announce it
  with `aria-live="polite"`, so the confirmation is not sighted-only.
- Show the token count. The `.md` responses already carry `x-markdown-tokens`
  from the viewer-response function, so "Copy as Markdown (≈1,200 tokens)" is
  available for free and is genuinely useful to someone budgeting context.
  Optional, but it is the kind of detail that suits this site.
- Place it near the byline, where the reader decides what to do with the page —
  not buried at the foot.

## Testing

**Unit** (`npm test`) — whatever pure logic is extracted: building the twin URL
from the current path (reuse or mirror the rule in `seoMeta.ts`, do not invent a
third), formatting the token count, the state machine for idle → copied → idle.

**End-to-end** (`npm run test:e2e`) — the behaviour only exists in a browser:
- the anchor is present and points at the twin **before** any JS runs
- clicking copies, and the clipboard content matches the `.md` the server serves
- the label returns to its resting state
- ⚠️ **Clipboard permissions in Playwright are reliable in Chromium only.**
  Grant `clipboard-read`/`clipboard-write` via the browser context. Firefox and
  WebKit will need either a skip or a different assertion — decide which rather
  than letting the test quietly not run.
- a rejection path: stub `navigator.clipboard.writeText` to reject and assert
  the control still tells the reader something.

**Build integration** (`npm run test:build`) — every article page emits an
anchor whose href resolves to a `.md` that exists in `dist/`. That is the same
class of guard as the tag-link gate: it makes a broken twin link impossible to
ship rather than merely unlikely.

## Acceptance Criteria

- [ ] A real `<a>` to the Markdown twin renders without JavaScript
- [ ] Clicking copies the twin's content to the clipboard
- [ ] A clipboard failure is visible to the reader, never silent
- [ ] Confirmation is announced to assistive tech, not just shown
- [ ] Logic lives in `src/utils/` and is imported, not duplicated into an
      inline script
- [ ] Unit tests for the extracted logic
- [ ] Playwright covers the happy path and the rejection path, with the
      non-Chromium situation decided explicitly
- [ ] Build test: every emitted twin link resolves to a file in `dist/`
- [ ] Token count shown, **or** a recorded decision not to
- [ ] Shipped together with `X-Robots-Tag: noindex` on `.md` responses
      (task F item 0c) — see the reasoning above
- [ ] `npm run build` + `npx astro check` with no new errors
      (verify with `^- [0-9]+ errors\?`; astro writes "1 error" singular)

## Notes

The `.md` twins are served through content negotiation at the edge, so the
button can simply fetch the page's own URL with `Accept: text/markdown` instead
of the `/index.md` path. **Prefer the explicit `/index.md` URL**: it is what the
anchor has to point at anyway for the no-JS case, and one URL doing both keeps
the fallback and the enhancement honest about fetching the same thing.

### Sources (read 2026-09-21)

- [blume#240 — Copy as Markdown silently no-ops](https://github.com/haydenbleasel/blume/issues/240) — the failure mode to design against
- [THEOplayer docs#856 — Copy page dropdown and Markdown alternate link](https://github.com/THEOplayer/documentation/pull/856)
- Existing precedent in this repo: `src/pages/index.astro` (bundled script importing a util) versus `src/utils/nazar.ts` (mirrored inline script)

## Log

- [2026-09-21] Created. Raised by Jon while deciding task F item 0c, on the
  observation that the twins have no human-facing entry point. Verified while
  writing: `index.astro` already bundles a script that imports from
  `src/utils/`, so the mirroring wart in `nazar.ts` does not have to be repeated.
