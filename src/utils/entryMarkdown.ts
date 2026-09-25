import { SEO_DEFAULTS } from "./seoMeta";
import { contactBlock } from "./contact";

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
 * Removes blocks fenced with `<!-- twin:omit -->` … `<!-- /twin:omit -->`.
 *
 * For markup that only makes sense on the HTML page, such as a chart drawn
 * in HTML. The rule that keeps this from becoming cloaking: whatever is
 * fenced off must also be in the document another way, e.g. the chart's
 * data table right after it. A start marker with no end is left alone,
 * because stripping to the end of the article would lose far more than a
 * stray block of markup costs.
 */
const OMIT_BLOCK = /\n*<!-- twin:omit -->[\s\S]*?<!-- \/twin:omit -->\n*/g;

function stripPageOnlyBlocks(body: string): string {
  return body.replace(OMIT_BLOCK, (_block, offset: number, whole: string) => {
    const atStart = offset === 0;
    const atEnd = offset + _block.length === whole.length;
    return atStart || atEnd ? "" : "\n\n";
  });
}

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
    stripPageOnlyBlocks(entry.body).trim(),
    "",
    contactBlock(),
  ].join("\n");
}
