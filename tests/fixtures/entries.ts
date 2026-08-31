/**
 * Entry fixtures for the `src/utils/entries.ts` helpers.
 *
 * Shaped like an Astro `CollectionEntry<"entries">` but built by hand — tests
 * must not depend on whatever happens to live in `src/content/entries/` today.
 * Only the fields the helpers actually read are populated.
 */

export interface FixtureEntry {
  id: string;
  collection: "entries";
  data: {
    title: string;
    description: string;
    pubDate: Date;
    kind: "blog" | "project";
    tags: string[];
    draft: boolean;
  };
}

function entry(
  id: string,
  pubDate: string,
  kind: "blog" | "project",
  tags: string[],
  draft = false,
): FixtureEntry {
  return {
    id,
    collection: "entries",
    data: {
      title: `Title for ${id}`,
      description: `Description for ${id}.`,
      pubDate: new Date(pubDate),
      kind,
      tags,
      draft,
    },
  };
}

/** Deliberately unsorted, mixed kinds, one draft, overlapping tags. */
export const mixedEntries: FixtureEntry[] = [
  entry("middle-blog", "2025-09-21", "blog", ["astro", "aws"]),
  entry("newest-project", "2026-03-02", "project", ["aws", "terraform"]),
  entry("oldest-blog", "2025-01-05", "blog", ["notes"]),
  entry("draft-blog", "2026-06-01", "blog", ["astro", "secret-tag"], true),
  entry("second-newest-blog", "2026-01-15", "blog", ["astro"]),
];

/** Entries sharing a publish date, to pin down sort stability. */
export const sameDateEntries: FixtureEntry[] = [
  entry("same-a", "2025-05-05", "blog", []),
  entry("same-b", "2025-05-05", "blog", []),
];

/** Every entry is a draft. */
export const allDraftEntries: FixtureEntry[] = [
  entry("draft-one", "2025-02-02", "blog", ["astro"], true),
  entry("draft-two", "2025-03-03", "project", ["aws"], true),
];

export const noEntries: FixtureEntry[] = [];

/**
 * An entry whose `tags` key is missing entirely.
 *
 * The schema defaults `tags` to `[]`, so this should be unreachable through the
 * content collection — but the helpers carry `?? []` fallbacks and hand-built
 * or future loader-sourced entries could still omit it. This fixture exercises
 * those fallbacks.
 */
export const entryWithoutTags = [
  {
    id: "no-tags",
    collection: "entries" as const,
    data: {
      title: "Untagged",
      description: "No tags key at all.",
      pubDate: new Date("2025-07-07"),
      kind: "blog" as const,
      draft: false,
    },
  },
] as unknown as FixtureEntry[];
