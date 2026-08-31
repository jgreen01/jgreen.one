/** Matches an absolute URL (`https://…`) or a protocol-relative one (`//cdn…`). */
const EXTERNAL_URL = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * Resolves a `heroImage` frontmatter value into a path the browser can request
 * from any page.
 *
 * Two shapes are valid, and the schema's `refine()` enforces them at build time:
 *   - site-absolute, normally `/media/<name>` — used as-is
 *   - external (`https://cdn.example.com/x.png`) — used as-is
 *
 * Anything else is dropped rather than emitted. A page-relative `src` resolves
 * against the *current page* URL, so `images/hero.png` on `/entries/some-post/`
 * would request `/entries/some-post/images/hero.png` and 404 while still looking
 * like a rendered image. Returning `undefined` renders no image at all, which
 * fails visibly instead of subtly — and the schema fails the build first anyway.
 *
 * @param heroImage the raw frontmatter value, if any
 * @returns an absolute path or URL, or `undefined` when there is nothing to render
 */
export function heroImagePath(heroImage: string | undefined | null): string | undefined {
  const value = heroImage?.trim();
  if (!value) return undefined;
  if (value.startsWith("/") || EXTERNAL_URL.test(value)) return value;
  return undefined;
}
