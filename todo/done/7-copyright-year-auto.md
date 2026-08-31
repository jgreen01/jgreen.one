# Auto-updating copyright year (range form)

**Priority**: LOW
**Status**: DONE (not committed — awaiting Jon's go-ahead)
**Created**: 2026-08-27
**Updated**: 2026-08-30

## Outcome

Footer now renders `© 2025–2026`, from `src/utils/copyright.ts` at build time, with an
`is:inline` script that bumps the end year from the visitor's clock.

| Gate | Result |
|---|---|
| `npm run check` | 0 errors |
| `npm test` | **138** (was 122 — 16 added) |
| `npm run test:build` | 18 |
| `npm run test:e2e` | **99** (was 93 — 6 added) |

Files: `src/utils/copyright.ts` (new), `tests/unit/copyright.test.ts` (new),
`src/layouts/Base.astro` (span + inline script), `tests/e2e/site.spec.ts` (footer tests),
`LICENSE.txt` (→ `© 2025–2026`, option **b**).

**`START_YEAR = 2025` confirmed three ways:** first commit `2025-08-11`, earliest entry
`pubDate: 2025-08-14`, and `LICENSE.txt`.

Two things worth knowing:

- **The old E2E test proved nothing.** It asserted the footer merely *contains* the
  current year, which a range satisfies without the client script running at all. It is
  replaced by four tests, the load-bearing one stubbing the browser clock to 2099 via
  `page.addInitScript` and asserting the footer reads `2025–2099`. A build-time-only
  implementation fails that test — which is the whole point.
- **The backwards case is covered too.** A visitor whose clock reads 2000 must not see
  `2025–2000`; `clientCopyrightLabel` returns `null` and the build output stands.

## Description

Make the footer copyright always look current with **zero maintenance**, using a range:
`© 2025–<current year> Jon Green`. Two layers:

1. **Build-time** — the end year defaults to the year the site was last built (≈ last
   deploy). This already happens (`new Date().getFullYear()` runs during `astro build`);
   this task just formalizes it.
2. **Client-side** — a tiny inline script recomputes the range from the real clock when
   the page renders, so if a year rolls over and the site hasn't been redeployed yet,
   visitors still see the new year. This is the part that "makes the site seem fresh"
   after a quiet start-of-year stretch.

Not legally load-bearing — a copyright notice is valid regardless of the year shown.
This is polish. Keep it small.

## Current state

- `src/layouts/Base.astro:57`:
  ```astro
  <small …>© <span id="year">{new Date().getFullYear()}</span> — Jon Green — Software Engineering & Data Science • Built with Astro • Open to thoughtful collaboration • 🧿</small>
  ```
  - `{new Date().getFullYear()}` evaluates at **build time** — already equals the deploy
    year. Single year, no range.
  - `<span id="year">` exists but **nothing updates it client-side** (the only script in
    `Base.astro` is the mobile-menu toggle). Vestigial hook — this task wires it.
- `LICENSE.txt` line 1: `© 2025 Jon Green. All rights reserved.` — hardcoded.
- Start year is **2025** (earliest entry `pubDate: 2025-08-14`; LICENSE says 2025).
  Confirm against `git log` before hardcoding.

## Design

### `src/utils/copyright.ts` (new)

Task 4 established the pattern: **logic never lives in `.astro` frontmatter**, because
Vitest cannot render Astro components. Put both the constants and the helper in one
module under `src/utils/`, alongside `entries.ts`, `seoMeta.ts`, `heroImagePath.ts` and
`parseAvatarSvg.ts`. `Base.astro` stays a thin consumer.

```ts
export const START_YEAR = 2025;
/** Evaluated at build time — equals the year of the last deploy. */
export const BUILD_YEAR = new Date().getFullYear();

/** `2025` when the years match, `2025–2026` once the end year is later. */
export function copyrightLabel(startYear: number, currentYear: number): string {
  return currentYear > startYear ? `${startYear}–${currentYear}` : String(startYear);
}
```

`–` = en dash — the correct character for a year range.

**Keep `BUILD_YEAR` out of `copyrightLabel`.** The helper takes both years as arguments
so tests can pass any year without stubbing the clock; only the module constant reads
`Date`. That is what makes the "would render 2025–2027 if built in 2027" criterion a
plain unit test rather than a fake-timer exercise.

### Markup (`Base.astro`)

```astro
---
import { START_YEAR, BUILD_YEAR, copyrightLabel } from '../utils/copyright';
---
…© <span id="copyright-years" data-start-year={START_YEAR}>{copyrightLabel(START_YEAR, BUILD_YEAR)}</span> — Jon Green — …
```

- Renders `2025` while build year == start year, `2025–2026` once it's later.

### Client script (`Base.astro`, `<script is:inline>`)

```html
<script is:inline>
  (function () {
    var el = document.getElementById('copyright-years');
    if (!el) return;
    var start = Number(el.dataset.startYear);
    var now = new Date().getFullYear();
    if (!start || now <= start) return;          // clock unset/behind → keep build output
    el.textContent = start + '–' + now;
  })();
</script>
```

- Recomputes from `data-start-year` + real clock — handles both "bump the end year" and
  "promote a single year into a range", independent of what the build rendered.
- `is:inline` so it ships as ~6 lines of inline JS, no bundle/network hit. Footer isn't
  LCP; running after parse is fine.
- Only ever moves the year forward; no-ops on a wrong/behind clock.

### `LICENSE.txt`

Decide (not automating a legal file):
- **(a)** Leave `© 2025` — legally fine; license files conventionally show the grant year.
- **(b)** Change to `© 2025–2026 Jon Green`, bump by hand each year. Low churn.

Recommend **(b)** for consistency with the footer, done manually.

## Testing

TDD per `AGENTS.md` — failing test first, then the helper, then wire `Base.astro`.

### New: `tests/unit/copyright.test.ts`

Cover `copyrightLabel(startYear, currentYear)` across the whole matrix:

| `currentYear` vs `startYear` | Expected |
|---|---|
| before (`2024`, `2025`) | `"2025"` — never render a range running backwards |
| equal (`2025`, `2025`) | `"2025"` — single year, no dash |
| after (`2025`, `2026`) | `"2025–2026"` |
| far after (`2025`, `2099`) | `"2025–2099"` |

Also assert the separator is an **en dash (U+2013), not a hyphen** — easy to get wrong
in an editor and invisible in review. `expect(label).toContain("–")` plus
`expect(label).not.toContain("-")`.

`BUILD_YEAR` needs one test that it equals `new Date().getFullYear()`; don't build
elaborate clock stubbing around a one-line constant.

### The client script must be testable too

Extract its computation, don't inline the logic twice:

```ts
/** Returns the label to display, or null when the build output should stand. */
export function clientCopyrightLabel(startYear: number, now: number): string | null {
  if (!startYear || now <= startYear) return null;
  return copyrightLabel(startYear, now);
}
```

Unit-test `null` for a missing/zero start year, `null` for a clock at or behind the
start year (a visitor with a wrong clock must never roll the year *backwards*), and the
correct range for a clock ahead. The `<script is:inline>` block then reads
`data-start-year`, calls the same rule, and assigns only on a non-null result.

### Update the existing E2E test

`tests/e2e/site.spec.ts` already has, under `navigation`:

```ts
test("the footer shows the current copyright year", …)
  → expect(page.locator("footer")).toContainText(String(new Date().getFullYear()))
```

That will still pass against a range and so proves nothing new. Extend it to assert:

- the footer matches `/©\s*\d{4}(–\d{4})?/`
- the span `#copyright-years` exists and carries `data-start-year="2025"`
- the rendered text starts with `2025`
- no console errors (the inline script runs on every page)

Add one test with the clock moved forward to prove the client-side bump actually fires:

```ts
await page.addInitScript(() => {
  const RealDate = Date;
  // @ts-expect-error - test double
  window.Date = class extends RealDate {
    getFullYear() { return 2099; }
  };
});
await page.goto("/");
await expect(page.locator("#copyright-years")).toHaveText("2025–2099");
```

This is the whole point of the task — a build-time-only year would still read `2025`
here. Without it, the client-side half is untested.

### Gate

```bash
npm run check && npm test && npm run test:build && npm run test:e2e
```

`test:build` also matters: its "no page leaks a literal `undefined`" assertion catches a
broken import or a misnamed export in the footer across all 22 pages at once.

## Acceptance Criteria

- [x] `START_YEAR` confirmed = 2025 (check `git log` for first commit / earliest content).
- [x] `src/utils/copyright.ts` exports `START_YEAR`, `BUILD_YEAR`, `copyrightLabel` and
      `clientCopyrightLabel`; `Base.astro` imports them and holds no logic of its own.
- [x] Footer renders `© 2025` today, and `copyrightLabel(2025, 2027)` returns
      `"2025–2027"` — proven by a plain unit test, no clock stubbing needed.
- [x] Inline client script promotes/updates the range from the real clock; no-ops when
      the clock is at/behind `START_YEAR`; no console errors.
- [x] No-JS / crawler view still shows a valid year (the build-time output).
- [x] `LICENSE.txt` decision made and applied.
- [x] Unit tests cover the full year matrix and the en-dash character; the E2E test is
      extended with a forward-clock case proving the client-side bump fires.
- [x] Full gate green: `npm run check`, `npm test`, `npm run test:build`,
      `npm run test:e2e`; footer eyeballed in `npm run preview`.

## Notes

- Keep the en dash (`–` / `–`), not a hyphen, for the range.
- The existing `id="year"` becomes `id="copyright-years"` — grep to confirm nothing else
  references `#year` (nothing does today).
- **Coordinate with task 8:** the Astro 7 upgrade changes `compressHTML` default from
  `true` to `'jsx'` — whitespace between inline elements gets stripped by JSX rules. The
  footer's ` — ` / ` • ` separators sit between inline elements; after the Astro upgrade,
  verify they didn't collapse and add `{" "}` (or set `compressHTML: true`) if they did.
  Not a blocker for this task.

## Log

- 2026-08-27 Created. Decided: range form `© 2025–<year>`, build-time end year
  (formalized into `src/consts.ts`) + `is:inline` client script that recomputes from
  `data-start-year` + real clock. Start year 2025 (LICENSE + earliest `pubDate`).
  Not started.
- 2026-08-30 **Revised after task 4 landed.** Moved the planned module from
  `src/consts.ts` to **`src/utils/copyright.ts`** to match the pattern task 4
  established — `.astro` files cannot be unit-tested, so logic lives in `src/utils/` and
  components stay thin wrappers. Added a **Testing** section: a new
  `tests/unit/copyright.test.ts` covering the year matrix and the en-dash character, a
  `clientCopyrightLabel()` extraction so the client script's rule is testable rather
  than duplicated inside the inline block, and an extension to the existing
  `tests/e2e/site.spec.ts` footer test — which currently only checks the footer contains
  the current year and would pass unchanged against a range, proving nothing. The new
  E2E case stubs the browser clock to 2099 to prove the client-side bump actually fires;
  without it the whole point of the task goes untested. Still not started.
- 2026-08-30 **Implemented.** TDD: wrote `tests/unit/copyright.test.ts` first (RED —
  module missing), then `src/utils/copyright.ts` exporting `START_YEAR`, `BUILD_YEAR`,
  `copyrightLabel` and `clientCopyrightLabel`, then wired `Base.astro`. 16 unit tests
  cover the year matrix, the en-dash character, and the client rule's `null` cases
  (missing/NaN start year, clock at or behind the start). Replaced the existing E2E
  footer assertion — which a range would have satisfied without the script running — with
  four tests including a `page.addInitScript` clock stub at 2099 proving the bump fires,
  and one at 2000 proving it never runs backwards. `LICENSE.txt` bumped to `© 2025–2026`
  by hand (option b). Full gate green: 138 unit, 18 build integration, 99 E2E, check
  clean. Nothing committed.
