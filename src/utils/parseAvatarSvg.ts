import { parse } from "node-html-parser";

/** The coordinate system the avatar artwork is drawn in. */
export const AVATAR_VIEWBOX = "0 0 1000 1000";

export interface ParsedSvg {
  /** Attributes declared on the source `<svg>` root element. */
  attributes: Record<string, string>;
  /** Everything inside the root element, ready for `set:html`. */
  innerHTML: string;
}

/**
 * Pulls the root `<svg>` element out of a raw SVG string.
 *
 * @throws if the markup contains no `<svg>` element
 */
export function parseAvatarSvg(rawSvg: string): ParsedSvg {
  const svg = parse(rawSvg ?? "").querySelector("svg");
  if (!svg) throw new Error("Avatar: no <svg> element found");
  return { attributes: { ...svg.attributes }, innerHTML: svg.innerHTML };
}

/**
 * Merges the source SVG's own attributes with the props a caller passed, then
 * forces the viewBox.
 *
 * The forced viewBox is load-bearing: `src/assets/avatar.svg` declares no
 * viewBox of its own, so without one the artwork will not scale.
 */
export function avatarSvgAttributes(
  attributes: Record<string, string>,
  props: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...attributes, ...props, viewBox: AVATAR_VIEWBOX };
}
