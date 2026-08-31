/** Matches an absolute URL (`https://…`) or a protocol-relative one (`//cdn…`). */
const EXTERNAL_URL = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * Resolves a `heroImage` frontmatter value into a path the browser can request
 * from any page.
 *
 * The schema documents `heroImage` as "Path in /public or external image URL",
 * so three shapes have to work:
 *   - site-absolute (`/og/post.png`) — used as-is
 *   - external (`https://cdn.example.com/x.png`) — used as-is
 *   - collection-relative (`images/hero.png`) — prefixed with the collection
 *
 * Returning an absolute path in every case matters: a bare relative `src`
 * resolves against the *current page* URL, so `images/hero.png` on
 * `/entries/some-post/` would request `/entries/some-post/images/hero.png`.
 *
 * @param heroImage the raw frontmatter value, if any
 * @param collection the collection the entry belongs to
 * @returns an absolute path or URL, or `undefined` when there is no image
 */
export function heroImagePath(
  heroImage: string | undefined | null,
  collection = "entries",
): string | undefined {
  const value = heroImage?.trim();
  if (!value) return undefined;
  if (value.startsWith("/") || EXTERNAL_URL.test(value)) return value;
  return `/${collection}/${value}`;
}
