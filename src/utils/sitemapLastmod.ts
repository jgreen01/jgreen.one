/**
 * Dates for the sitemap.
 *
 * A sitemap without `lastmod` gives a crawler no signal that anything changed,
 * so stale pages sit in the index until it happens to revisit them. These
 * helpers date each URL from the content that actually drives it.
 *
 * The rule throughout is that a date must be earned. A page we cannot honestly
 * date gets no `lastmod` at all, because a crawler that learns the field is
 * unreliable stops trusting every one of them.
 *
 * Frontmatter is read with a small parser rather than a YAML library: the
 * sitemap is built in `astro.config.mjs`, before the content collections
 * exist, and the four fields needed here are written in a consistent shape.
 */

export interface EntryMeta {
  slug: string;
  /** `updatedDate` when present, else `pubDate`, as `YYYY-MM-DD`. */
  date: string;
  tags: string[];
  draft: boolean;
}

/** Listing pages whose content changes whenever any entry does. */
const LISTING_PATHS = new Set(["/", "/blog/", "/projects/", "/entries/", "/tags/"]);

const DATE_FIELD = (field: string) =>
  new RegExp(`^${field}:\\s*["']?(\\d{4}-\\d{2}-\\d{2})`, "m");

function frontmatterOf(source: string): string | null {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

/**
 * Pull the sitemap-relevant fields out of an entry's frontmatter.
 *
 * Returns null when the file has no frontmatter or carries no usable date,
 * since an entry that cannot be dated must not contribute one.
 */
export function parseEntry(slug: string, source: string): EntryMeta | null {
  const frontmatter = frontmatterOf(source);
  if (frontmatter === null) return null;

  const updated = frontmatter.match(DATE_FIELD("updatedDate"));
  const published = frontmatter.match(DATE_FIELD("pubDate"));
  const date = (updated ?? published)?.[1];
  if (!date) return null;

  const tagLine = frontmatter.match(/^tags:\s*\[(.*?)\]/m);
  const tags = tagLine
    ? tagLine[1]
        .split(",")
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : [];

  return { slug, date, tags, draft: /^draft:\s*true\b/m.test(frontmatter) };
}

const newest = (entries: EntryMeta[]): string | undefined =>
  entries.reduce<string | undefined>(
    (latest, entry) => (latest === undefined || entry.date > latest ? entry.date : latest),
    undefined,
  );

/**
 * The `lastmod` for one sitemap URL, or undefined when it cannot be dated.
 *
 * Entry pages take their own date, and so do sub-routes such as a transcript.
 * Listings take the newest published entry; a tag page takes the newest entry
 * carrying that tag. Everything else, `/about` and `/contact` among them, is
 * left undated.
 */
export function lastmodFor(pathname: string, entries: EntryMeta[]): string | undefined {
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const published = entries.filter((entry) => !entry.draft);

  const entryMatch = path.match(/^\/entries\/([^/]+)\//);
  if (entryMatch) {
    return published.find((entry) => entry.slug === entryMatch[1])?.date;
  }

  const tagMatch = path.match(/^\/tags\/([^/]+)\//);
  if (tagMatch) {
    return newest(published.filter((entry) => entry.tags.includes(tagMatch[1])));
  }

  return LISTING_PATHS.has(path) ? newest(published) : undefined;
}
