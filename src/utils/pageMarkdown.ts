/**
 * Markdown twins for the pages that are not entries.
 *
 * An entry's twin is its own prose. A listing has no prose of its own — it is
 * an index — so its twin is generated from the same collection data the HTML
 * renders, which means the two cannot drift.
 *
 * Links point at each entry's Markdown twin rather than its HTML. The twin
 * already exists for every entry and is the useful destination for whatever is
 * reading this; sending it back to the markup would defeat the point.
 */
import { SEO_DEFAULTS } from "./seoMeta";
import { contactBlock } from "./contact";
import { isoDate } from "./formatDate";

const SITE = SEO_DEFAULTS.site;

/** The slice of an entry a listing needs. */
export interface ListedEntry {
  id: string;
  title: string;
  description: string;
  kind: "blog" | "project";
  pubDate: Date | string;
  tags: string[];
}

export interface ListingOptions {
  title: string;
  description: string;
  /** Site-relative path of the page this describes, e.g. `/blog/`. */
  path: string;
  entries: ListedEntry[];
  /** Optional prose shown above the list, for pages that have some. */
  intro?: string;
}

const absolute = (path: string) => `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;

/** One list item: linked title, then the facts that help decide whether to open it. */
function itemFor(entry: ListedEntry): string {
  const meta = [
    entry.kind === "project" ? "Project" : "Blog",
    isoDate(entry.pubDate),
    entry.tags.length > 0 ? entry.tags.join(", ") : null,
  ].filter(Boolean);

  return [
    `- [${entry.title}](${SITE}/entries/${entry.id}): ${entry.description}`,
    `  ${meta.join(" • ")}`,
    `  Markdown: ${SITE}/entries/${entry.id}/index.md`,
  ].join("\n");
}

/**
 * A listing page as a standalone Markdown document.
 *
 * Shaped like `llms.txt` — an h1, a blockquote summary, then a list of links
 * with notes — because that is the convention a reader of this file is most
 * likely to already understand.
 */
export function listingMarkdown({
  title,
  description,
  path,
  entries,
  intro,
}: ListingOptions): string {
  const body =
    entries.length > 0
      ? entries.map(itemFor).join("\n")
      : "Nothing is published here yet.";

  return [
    `# ${title}`,
    "",
    `> ${description}`,
    "",
    ...(intro ? [intro, ""] : []),
    `Source: ${absolute(path)}`,
    "",
    "---",
    "",
    body,
    "",
    contactBlock(),
  ].join("\n");
}

export interface TagCount {
  tag: string;
  count: number;
}

/** The tag index: every tag, how many entries carry it, and where to find them. */
export function tagsIndexMarkdown({
  path,
  tags,
}: {
  path: string;
  tags: TagCount[];
}): string {
  const body =
    tags.length > 0
      ? tags
          .map(
            ({ tag, count }) =>
              `- [${tag}](${SITE}/tags/${encodeURIComponent(tag)}/): ${count} ${
                count === 1 ? "entry" : "entries"
              }`,
          )
          .join("\n")
      : "No tags yet.";

  return [
    "# Tags",
    "",
    "> Every tag used across the site, and how many entries carry it.",
    "",
    `Source: ${absolute(path)}`,
    "",
    "---",
    "",
    body,
    "",
    contactBlock(),
  ].join("\n");
}
