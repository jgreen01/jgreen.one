/**
 * Tag URL construction.
 *
 * Lives here rather than in component frontmatter because two components and
 * one page all need to build the same URL, and a mismatch between them ships
 * either a 404 or a needless duplicate-shape fetch. `.astro` files cannot be
 * unit-tested, so the rule that keeps them consistent is tested here instead.
 */

/**
 * The site-absolute URL of a tag's page.
 *
 * The trailing slash is deliberate: the unslashed form serves a 200 whose
 * canonical points at the slashed URL, so linking it asks a crawler to fetch a
 * duplicate shape for nothing.
 */
export function tagHref(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}
