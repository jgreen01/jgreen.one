# Auto-updating copyright year (range form)

**Priority**: LOW
**Status**: TODO
**Created**: 2026-08-27
**Updated**: 2026-08-27

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

### `src/consts.ts` (new, or add to an existing consts module)

```ts
export const START_YEAR = 2025;
export const BUILD_YEAR = new Date().getFullYear(); // evaluated at build time
```

Centralizes both and makes them unit-testable.

### Year-label helper (pure, testable)

```ts
export function copyrightLabel(startYear: number, currentYear: number): string {
  return currentYear > startYear ? `${startYear}–${currentYear}` : String(startYear);
}
```

`–` = en dash — the correct character for a year range.

### Markup (`Base.astro`)

```astro
---
import { START_YEAR, BUILD_YEAR } from '../consts';
import { copyrightLabel } from '../consts'; // or wherever the helper lives
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

## Acceptance Criteria

- [ ] `START_YEAR` confirmed = 2025 (check `git log` for first commit / earliest content).
- [ ] `src/consts.ts` exports `START_YEAR` and `BUILD_YEAR`; `Base.astro` imports them.
- [ ] Footer renders `© 2025` today, and would render `© 2025–2027` if built in 2027
      (verify via a test that stubs the current year).
- [ ] Inline client script promotes/updates the range from the real clock; no-ops when
      the clock is at/behind `START_YEAR`; no console errors.
- [ ] No-JS / crawler view still shows a valid year (the build-time output).
- [ ] `LICENSE.txt` decision made and applied.
- [ ] Tests (per AGENTS.md TDD): unit-test `copyrightLabel(startYear, currentYear)` across
      `now < start`, `now == start`, `now > start`; and the client-script compute logic
      (extract it to a pure function and test the same matrix).
- [ ] `npm run build` + `npm run check` clean; footer eyeballed in `npm run preview`.

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
