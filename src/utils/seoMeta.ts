/** Matches an absolute URL (`https://…`) or a protocol-relative one (`//cdn…`). */
const EXTERNAL_URL = /^([a-z][a-z0-9+.-]*:)?\/\//i;

export interface SeoProps {
  title?: string;
  description?: string;
  /** Path or full URL for the canonical link, e.g. `Astro.url.pathname`. */
  url?: string;
  /** Site-relative path (`/og/post.png`) or an absolute image URL. */
  image?: string;
  type?: "website" | "article";
  /** Base URL; override for staging or preview builds. */
  site?: string;
}

export interface SeoMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  type: "website" | "article";
  site: string;
}

export const SEO_DEFAULTS = {
  site: "https://jgreen.one",
  title: "Jon Green — Software Developer, AI & Data Science",
  description:
    "Personal site of Jon Green: senior software developer & MCS-DS student. I write about AI/ML, infrastructure-as-code, and full-stack development.",
  image: "/media/og-default.png",
  type: "website",
} as const satisfies Omit<SeoMeta, "url">;

/**
 * Joins a site base with a site-relative path.
 *
 * Deliberately string-based rather than `new URL()`, which percent-encodes any
 * non-ASCII character in a path. Asset filenames are ASCII today, but a single
 * accented character in a future filename would silently point the tag at a
 * file that does not exist.
 */
function joinUrl(base: string, path: string): string {
  if (EXTERNAL_URL.test(path)) return path;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/**
 * Resolves the props passed to `<SEO />` into the concrete values rendered in
 * `<head>`, applying defaults and making every URL absolute.
 *
 * Crawlers treat a relative `og:image` or `canonical` as invalid, so both are
 * always returned fully qualified.
 */
export function seoMeta(props: SeoProps = {}): SeoMeta {
  const site = props.site ?? SEO_DEFAULTS.site;

  return {
    site,
    title: props.title ?? SEO_DEFAULTS.title,
    description: props.description ?? SEO_DEFAULTS.description,
    url: new URL(props.url ?? "/", site).toString(),
    image: joinUrl(site, props.image ?? SEO_DEFAULTS.image),
    type: props.type ?? SEO_DEFAULTS.type,
  };
}
