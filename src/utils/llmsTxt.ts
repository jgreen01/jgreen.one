import { SEO_DEFAULTS } from "./seoMeta";
import { CONTACT } from "./contact";
import { filterByKind, filterDrafts, sortByDate, type EntryLike } from "./entries";

/** The slice of an entry `llms.txt` needs. */
export interface ListableEntry extends EntryLike {
  id: string;
  collection: string;
  data: EntryLike["data"] & { title: string; description: string };
}

/** The slice of a transcript↔entry pair `llms.txt` needs. */
export interface ListableTranscriptPair {
  transcript: { data: { title: string; description: string } };
  entry: { id: string };
}

/**
 * The site's own pages, each of which now has a Markdown twin.
 *
 * Listed first because they are the way in: an agent that follows `/entries/`
 * or `/tags/` can navigate the whole site from there, whereas the sections
 * below are a flat dump of everything. Hard-coded rather than derived, because
 * these are the site's fixed routes and there are seven of them.
 */
const PAGES = [
  ["/index.md", "Home", "The site's front page, with the most recent entries."],
  ["/about/index.md", "About", "Who I am and what I work on."],
  ["/blog/index.md", "Blog", "Every post, newest first."],
  ["/projects/index.md", "Projects", "Every project, newest first."],
  ["/entries/index.md", "All entries", "Posts and projects together in one list."],
  ["/tags/index.md", "Tags", "Every tag, and how many entries carry it."],
  ["/contact/index.md", "Contact", "Ways to get in touch."],
] as const;

function pagesSection(): string[] {
  return [
    "## Pages",
    "",
    ...PAGES.map(
      ([path, title, description]) =>
        `- [${title}](${SEO_DEFAULTS.site}${path}): ${description}`,
    ),
    "",
  ];
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
 * Talk transcripts, listed separately from the writing.
 *
 * They are labelled as transcripts because an agent should be able to tell
 * spoken words from written ones before quoting them — the two carry different
 * weight, and a transcript is lightly edited speech rather than a considered
 * sentence.
 */
function transcriptSection(pairs: readonly ListableTranscriptPair[]): string[] {
  if (pairs.length === 0) return [];

  return [
    "## Transcripts",
    "",
    ...pairs.map(({ transcript, entry }) => {
      const url = `${SEO_DEFAULTS.site}/entries/${entry.id}/transcript.md`;
      return `- [${transcript.data.title} — transcript](${url}): ${transcript.data.description}`;
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
export function llmsTxt(
  entries: readonly ListableEntry[],
  transcripts: readonly ListableTranscriptPair[] = [],
): string {
  // Callers filter drafts; doing it again here means a mistake upstream cannot
  // publish unfinished writing to every agent that reads this file.
  const published = filterDrafts(entries) as ListableEntry[];

  return [
    `# ${SEO_DEFAULTS.title}`,
    "",
    `> ${SEO_DEFAULTS.description}`,
    "",
    "Each link below points at a Markdown copy of the page — same content as the",
    "HTML, without the markup. Every page on the site has one: append index.md to",
    "any path, or send Accept: text/markdown and the edge will serve it.",
    "",
    // An agent may read only this file. Without these it has the writing and no
    // route back to whoever wrote it. Plain text, not links, so the assertion
    // that every markdown link ends in .md still holds.
    `Author: ${CONTACT.name}, ${CONTACT.role}`,
    `Contact: ${CONTACT.email} | ${CONTACT.githubHandle} | ${CONTACT.linkedinHandle}`,
    "",
    ...pagesSection(),
    ...SECTIONS.flatMap(({ kind, heading }) =>
      section(filterByKind(published, kind) as ListableEntry[], heading),
    ),
    ...transcriptSection(transcripts),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}
