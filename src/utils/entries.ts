/**
 * Pure helpers for querying the `entries` collection.
 *
 * These take plain arrays rather than calling `getCollection()` so they can be
 * unit-tested outside Astro's build pipeline — `astro:content` is a virtual
 * module that only exists during a build. Pages fetch the collection and hand
 * the result to these functions.
 *
 * Every helper is non-mutating: callers chain them freely without a filter
 * reordering the array a later call depends on.
 */

/** The slice of an entry these helpers actually read. */
export interface EntryLike {
  data: {
    pubDate: Date;
    kind: "blog" | "project";
    tags: string[];
    draft: boolean;
  };
}

/** Drops unpublished entries. */
export function filterDrafts<T extends EntryLike>(entries: readonly T[]): T[] {
  return entries.filter((entry) => !entry.data.draft);
}

/** Newest `pubDate` first. Entries sharing a date keep their input order. */
export function sortByDate<T extends EntryLike>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => +b.data.pubDate - +a.data.pubDate);
}

/** Keeps only entries of the given kind. */
export function filterByKind<T extends EntryLike>(
  entries: readonly T[],
  kind: "blog" | "project",
): T[] {
  return entries.filter((entry) => entry.data.kind === kind);
}

/** Keeps only entries carrying the given tag (exact, case-sensitive match). */
export function filterByTag<T extends EntryLike>(entries: readonly T[], tag: string): T[] {
  return entries.filter((entry) => (entry.data.tags ?? []).includes(tag));
}

/** Every distinct tag across the given entries, sorted alphabetically. */
export function uniqueTags(entries: readonly EntryLike[]): string[] {
  const tags = new Set<string>();
  for (const entry of entries) for (const tag of entry.data.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * Tag counts as `[tag, count]` pairs, sorted by tag name.
 *
 * Callers filter drafts first when the counts should reflect published entries
 * only — this function counts whatever it is given.
 */
export function aggregateTags(entries: readonly EntryLike[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.data.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
