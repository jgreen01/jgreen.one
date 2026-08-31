/**
 * SVG fixtures for `parseAvatarSvg` tests.
 *
 * `recordedAvatarSvg` is a faithful, trimmed capture of the real
 * `src/assets/avatar.svg`: the same root-element attributes (`xmlns:ns0`,
 * `version`, and notably **no** `viewBox`) and the same `<path>` shape
 * (`fill="var(--ink)"` + a `transform`). The real file carries 140 such paths;
 * two are enough to exercise the parser.
 *
 * Capturing the real structure matters here — the component forces a `viewBox`
 * precisely *because* the source asset lacks one. A hand-invented fixture with a
 * `viewBox` would hide that.
 */
export const recordedAvatarSvg = `<svg xmlns:ns0="http://www.w3.org/2000/svg" version="1.1">
  <path d="M0 0 C7.28421548 -0.02312916 14.5684231 -0.04091801 21.85266781 -0.05181217 Z " fill="var(--ink)" transform="translate(472,88)" />
  <path d="M-5 845 C-1 846 -1 846 -1 846 Z " fill="var(--ink)" transform="translate(469,88)" />
</svg>`;

/** Root element already carries a viewBox — the component must still override it. */
export const svgWithOwnViewBox = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="original"><path d="M0 0 Z" /></svg>`;

/** Well-formed markup with no <svg> root at all. */
export const svgMissingRoot = `<div><p>no svg here</p></div>`;

/** Empty input. */
export const emptySvg = "";
