import { SEO_DEFAULTS } from "./seoMeta";
import { filterByKind, filterDrafts, sortByDate, type EntryLike } from "./entries";

/** The slice of an entry `llms.txt` needs. */
export interface ListableEntry extends EntryLike {
  id: string;
  collection: string;
  data: EntryLike["data"] & { title: string; description: string };
}

const SECTIONS = [
  { kind: "blog" as const, heading: "Blog posts" },
  { kind: "project" as const, heading: "Projects" },
];

function section(entries: ListableEntry[], heading: string): string[] {
  // An empty section is worse than a missing one — a bare heading reads as
  // content that failed to load.
  if (entries.length === 0) return [];

  return [
    `## ${heading}`,
    "",
    ...sortByDate(entries).map((entry) => {
      const url = `${SEO_DEFAULTS.site}/${entry.collection}/${entry.id}/index.md`;
      return `- [${entry.data.title}](${url}): ${entry.data.description}`;
    }),
    "",
  ];
}

/**
 * Renders `/llms.txt` — the convention for telling an agent what a site contains
 * and where to read it cheaply.
 *
 * Links point at the `.md` files rather than the HTML pages, which is the entire
 * purpose: an agent that follows them pays roughly 83% fewer tokens.
 *
 * Expectations should stay low. Adoption sits around 8–10% of sites, no major AI
 * company has committed to reading it, and the AI *search* crawlers it nominally
 * serves mostly ignore it in favour of crawling HTML. Its demonstrated consumers
 * are IDE agents — Claude Code, Cursor, Copilot and friends — which is a real
 * enough audience for a file this cheap to produce.
 */
export function llmsTxt(entries: readonly ListableEntry[]): string {
  // Callers filter drafts; doing it again here means a mistake upstream cannot
  // publish unfinished writing to every agent that reads this file.
  const published = filterDrafts(entries) as ListableEntry[];

  return [
    `# ${SEO_DEFAULTS.title}`,
    "",
    `> ${SEO_DEFAULTS.description}`,
    "",
    "Each link below points at a Markdown copy of the page — same content as the",
    "HTML, without the markup.",
    "",
    ...SECTIONS.flatMap(({ kind, heading }) =>
      section(filterByKind(published, kind) as ListableEntry[], heading),
    ),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}
