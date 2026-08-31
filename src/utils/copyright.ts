/** The year the site began: first commit 2025-08-11, earliest entry 2025-08-14. */
export const START_YEAR = 2025;

/**
 * The year the site was built.
 *
 * Astro evaluates this at build time, so it equals the year of the last deploy.
 * Kept as a module constant rather than read inside `copyrightLabel` so the
 * helper stays a pure function of its arguments and needs no clock stubbing.
 */
export const BUILD_YEAR = new Date().getFullYear();

/** En dash (U+2013) — the correct separator for a year range, not a hyphen. */
const EN_DASH = "–";

/**
 * Formats a copyright year label.
 *
 * Renders a single year until the end year moves past the start, then a range.
 * A `currentYear` earlier than `startYear` (a visitor with a wrong clock) falls
 * back to the single start year rather than producing a backwards range.
 */
export function copyrightLabel(startYear: number, currentYear: number): string {
  return currentYear > startYear
    ? `${startYear}${EN_DASH}${currentYear}`
    : String(startYear);
}

/**
 * The label the client-side script should display, or `null` to leave the
 * build-time output alone.
 *
 * Split out from the inline script so the rule is tested once here rather than
 * duplicated, untested, inside a `<script is:inline>` block.
 *
 * @param startYear parsed from `data-start-year`; `0`/`NaN` when absent or malformed
 * @param now the visitor's current year
 */
export function clientCopyrightLabel(startYear: number, now: number): string | null {
  if (!startYear || Number.isNaN(startYear) || now <= startYear) return null;
  return copyrightLabel(startYear, now);
}
