/**
 * Links numbered citations to the article's References list.
 *
 * An article that cites like "…within one to five years.[1]" and ends with an
 * ordered list directly under a "References" heading gets each [n] turned into
 * a link to item n, and each item an id to land on (`#ref-n`). The Markdown is
 * never edited: the text stays exactly as written, and the Markdown twin keeps
 * the plain [n].
 *
 * Deliberately conservative, because "[1]" also means array access in prose:
 * - nothing happens without a References heading followed by an ordered list;
 * - only numbers that name an item in that list are linked;
 * - only text before the heading is scanned, so the list itself is left alone;
 * - code, existing links and link definitions are never touched.
 *
 * A remark plugin, registered in astro.config.mjs. Kept in src/utils so it can
 * be unit-tested through Astro's own Markdown processor.
 */
import type { RemarkPlugin } from "@astrojs/markdown-remark";

/** The slice of an mdast node this plugin reads or writes. */
interface MdNode {
  type: string;
  value?: string;
  ordered?: boolean | null;
  start?: number | null;
  url?: string;
  title?: string | null;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>;
}

const HEADING = /^references$/i;
const CITATION = /\[(\d+)\]/g;
/**
 * Browsers may break a line between "." and "[", stranding a citation at the
 * start of the next line, away from its sentence. U+2060 WORD JOINER forbids
 * that break and renders as nothing. Not added after whitespace, where a break
 * is fine.
 */
const WORD_JOINER = "⁠";
const LEAVE_ALONE = new Set(["code", "inlineCode", "link", "linkReference", "definition", "html"]);

function textOf(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

function withProperties(node: MdNode, properties: Record<string, unknown>): void {
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, ...properties } };
}

/** A text node's value, split around every citation `isReference` accepts. */
function splitCitations(node: MdNode, isReference: (n: number) => boolean): MdNode[] {
  const value = node.value ?? "";
  const parts: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const n = Number(match[1]);
    if (!isReference(n)) continue;
    const at = match.index ?? 0;
    const joiner = at > 0 && /\s/.test(value[at - 1]) ? "" : WORD_JOINER;
    if (at > last || joiner) parts.push({ type: "text", value: value.slice(last, at) + joiner });
    const citation: MdNode = { type: "link", url: `#ref-${n}`, title: null, children: [{ type: "text", value: match[0] }] };
    withProperties(citation, { className: ["citation"], ariaLabel: `Reference ${n}` });
    parts.push(citation);
    last = at + match[0].length;
  }
  if (parts.length === 0) return [node];
  if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

function linkWithin(parent: MdNode, isReference: (n: number) => boolean): void {
  if (!parent.children) return;
  parent.children = parent.children.flatMap((child) => {
    if (LEAVE_ALONE.has(child.type)) return [child];
    if (child.type === "text") return splitCitations(child, isReference);
    linkWithin(child, isReference);
    return [child];
  });
}

/** Mutates the tree: ids on the reference items, links on the citations. */
export function linkCitations(tree: MdNode): void {
  const top = tree.children ?? [];
  const headingAt = top.findIndex((node) => node.type === "heading" && HEADING.test(textOf(node).trim()));
  if (headingAt === -1) return;
  const list = top[headingAt + 1];
  if (!list || list.type !== "list" || !list.ordered) return;

  const first = list.start ?? 1;
  const items = list.children ?? [];
  items.forEach((item, i) => withProperties(item, { id: `ref-${first + i}` }));
  const isReference = (n: number) => n >= first && n < first + items.length;

  for (const node of top.slice(0, headingAt)) {
    if (LEAVE_ALONE.has(node.type)) continue;
    linkWithin(node, isReference);
  }
}

export const remarkCitations: RemarkPlugin = () => (tree) => linkCitations(tree as unknown as MdNode);
