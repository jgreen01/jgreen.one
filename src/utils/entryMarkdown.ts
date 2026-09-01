import { SEO_DEFAULTS } from "./seoMeta";

/** The slice of a collection entry needed to render its Markdown document. */
export interface MarkdownableEntry {
  id: string;
  collection: string;
  /** Raw Markdown body, frontmatter already stripped by the content loader. */
  body: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    updatedDate?: Date;
    kind: "blog" | "project";
    tags: string[];
    draft: boolean;
  };
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Renders an entry as a standalone Markdown document.
 *
 * This is the same content as the HTML page, in a lighter format — not a
 * different or summarised version. Serving genuinely different content to
 * machines would be cloaking; serving the same words without the markup is
 * ordinary content negotiation.
 *
 * The preamble exists because the file is read with no surrounding page and no
 * frontmatter parser. A reader needs the title, when it was written, and above
 * all the canonical URL, so the source can be cited rather than quoted
 * anonymously.
 */
export function entryMarkdown(entry: MarkdownableEntry): string {
  const { data } = entry;
  const url = `${SEO_DEFAULTS.site}/${entry.collection}/${entry.id}`;

  const meta = [
    `Published: ${isoDate(data.pubDate)}`,
    data.updatedDate ? `Updated: ${isoDate(data.updatedDate)}` : null,
    data.tags.length > 0 ? `Tags: ${data.tags.join(", ")}` : null,
    `Source: ${url}`,
  ].filter(Boolean);

  return [
    `# ${data.title}`,
    "",
    `> ${data.description}`,
    "",
    meta.join("  \n"),
    "",
    "---",
    "",
    entry.body.trim(),
    "",
  ].join("\n");
}
