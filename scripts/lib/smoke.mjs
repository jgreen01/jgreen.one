/**
 * Helpers for the manual smoke pass.
 *
 * The Playwright suite asserts specific behaviours. This is the other half of
 * the loop the AGENTS.md rule describes: walk the real pages, in both themes
 * and both viewports, and look at them. A human still does the looking — this
 * just makes sure the same pages get looked at every time, and shouts about
 * console errors and bad status codes along the way.
 *
 * Pure functions live here so the matrix and the filenames can be tested
 * without launching a browser; `scripts/smoke.mjs` drives Playwright.
 */

/**
 * Every (route × viewport × theme) combination to visit.
 *
 * Ordered route-major so the run — and the screenshot folder — reads in page
 * order rather than jumping between pages as the theme flips.
 *
 * @typedef {{ name: string, width: number, height: number }} Viewport
 * @param {{ routes?: readonly string[], viewports?: readonly Viewport[],
 *           themes?: readonly string[] }} [config]
 * @returns {{ route: string, viewport: Viewport, theme: string }[]}
 */
export function smokeTargets({ routes = [], viewports = [], themes = [] } = {}) {
  const targets = [];
  for (const route of routes) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        targets.push({ route, viewport, theme });
      }
    }
  }
  return targets;
}

/**
 * A flat, sortable filename for one screenshot.
 *
 * Slashes collapse to hyphens so everything lands in one directory, and a
 * trailing slash is dropped first so `/blog` and `/blog/` cannot produce two
 * near-identical files that quietly diverge.
 */
export function screenshotName(route, viewport, theme) {
  const slug =
    String(route)
      .replace(/\/+$/, "")
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "home";

  return `${slug}--${viewport}--${theme}.png`;
}

/**
 * Whether a status code is the right answer for a route.
 *
 * `/404` is the one page whose correct response is a 4xx. Encoding that once,
 * here, is what stops the navigation check and the sub-resource check
 * disagreeing about whether the same response counts as a failure.
 */
export function isExpectedStatus(route, status) {
  if (!status) return false;
  if (route === "/404") return status === 404 || status === 200;
  return status < 400;
}

/**
 * Whether a console message is known dev-server noise rather than a defect.
 *
 * @param {string} text
 * @param {readonly string[]} [ignorePatterns]
 * @returns {boolean}
 */
export function isIgnorableConsoleMessage(text, ignorePatterns = []) {
  return ignorePatterns.some((pattern) => String(text).includes(pattern));
}

/**
 * Totals plus the failing entries, for the closing report.
 *
 * @template {{ ok: boolean }} T
 * @param {readonly T[]} [results]
 */
export function summarise(results = []) {
  const failures = results.filter((result) => !result.ok);
  return {
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    failures,
  };
}

/** The pages worth looking at on every change. Overridable with --routes. */
export const DEFAULT_ROUTES = [
  "/",
  "/blog/",
  "/projects/",
  "/entries/",
  "/tags/",
  "/about",
  "/contact",
  "/404",
];

export const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

export const DEFAULT_THEMES = ["light", "dark"];

/** Messages a working dev server emits regardless. */
export const DEFAULT_IGNORED = ["[vite]", "Download the React DevTools"];
