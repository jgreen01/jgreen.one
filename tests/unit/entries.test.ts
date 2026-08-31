import { describe, it, expect } from "vitest";
import {
  filterDrafts,
  sortByDate,
  filterByKind,
  filterByTag,
  uniqueTags,
  aggregateTags,
} from "../../src/utils/entries";
import {
  mixedEntries,
  sameDateEntries,
  allDraftEntries,
  noEntries,
  entryWithoutTags,
} from "../fixtures/entries";

describe("filterDrafts", () => {
  it("excludes entries marked draft: true", () => {
    const result = filterDrafts(mixedEntries);
    expect(result.map((e) => e.slug)).not.toContain("draft-blog");
  });

  it("keeps every published entry", () => {
    expect(filterDrafts(mixedEntries)).toHaveLength(mixedEntries.length - 1);
  });

  it("returns an empty array when every entry is a draft", () => {
    expect(filterDrafts(allDraftEntries)).toEqual([]);
  });

  it("handles an empty collection", () => {
    expect(filterDrafts(noEntries)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...mixedEntries];
    filterDrafts(input);
    expect(input).toHaveLength(mixedEntries.length);
  });
});

describe("sortByDate", () => {
  it("orders entries newest first", () => {
    expect(sortByDate(mixedEntries).map((e) => e.slug)).toEqual([
      "draft-blog",
      "newest-project",
      "second-newest-blog",
      "middle-blog",
      "oldest-blog",
    ]);
  });

  it("returns a new array rather than sorting in place", () => {
    const input = [...mixedEntries];
    const before = input.map((e) => e.slug);
    sortByDate(input);
    expect(input.map((e) => e.slug)).toEqual(before);
  });

  it("preserves input order for entries sharing a date", () => {
    expect(sortByDate(sameDateEntries).map((e) => e.slug)).toEqual(["same-a", "same-b"]);
  });

  it("handles an empty collection", () => {
    expect(sortByDate(noEntries)).toEqual([]);
  });
});

describe("filterByKind", () => {
  it("returns only blog entries", () => {
    const result = filterByKind(mixedEntries, "blog");
    expect(result.every((e) => e.data.kind === "blog")).toBe(true);
    expect(result).toHaveLength(4);
  });

  it("returns only project entries", () => {
    expect(filterByKind(mixedEntries, "project").map((e) => e.slug)).toEqual([
      "newest-project",
    ]);
  });

  it("composes with filterDrafts to drop unpublished posts", () => {
    const result = filterByKind(filterDrafts(mixedEntries), "blog");
    expect(result.map((e) => e.slug)).toEqual([
      "middle-blog",
      "oldest-blog",
      "second-newest-blog",
    ]);
  });
});

describe("filterByTag", () => {
  it("returns entries carrying the tag", () => {
    expect(filterByTag(mixedEntries, "aws").map((e) => e.slug)).toEqual([
      "middle-blog",
      "newest-project",
    ]);
  });

  it("returns an empty array for an unknown tag", () => {
    expect(filterByTag(mixedEntries, "nonexistent")).toEqual([]);
  });

  it("matches exactly and is case-sensitive", () => {
    expect(filterByTag(mixedEntries, "AWS")).toEqual([]);
  });
});

describe("uniqueTags", () => {
  it("de-duplicates tags shared across entries", () => {
    // "astro" appears on three entries and "aws" on two; each must appear once.
    const tags = uniqueTags(mixedEntries);
    expect(tags.filter((t) => t === "astro")).toHaveLength(1);
    expect(tags.filter((t) => t === "aws")).toHaveLength(1);
  });

  it("returns tags sorted alphabetically", () => {
    expect(uniqueTags(mixedEntries)).toEqual([
      "astro",
      "aws",
      "notes",
      "secret-tag",
      "terraform",
    ]);
  });

  it("only sees tags from the entries it is given", () => {
    // Callers filter drafts first; the draft-only tag must then disappear.
    expect(uniqueTags(filterDrafts(mixedEntries))).not.toContain("secret-tag");
  });

  it("handles an empty collection", () => {
    expect(uniqueTags(noEntries)).toEqual([]);
  });
});

describe("aggregateTags", () => {
  it("counts how many entries carry each tag", () => {
    expect(aggregateTags(mixedEntries)).toEqual([
      ["astro", 3],
      ["aws", 2],
      ["notes", 1],
      ["secret-tag", 1],
      ["terraform", 1],
    ]);
  });

  it("sorts by tag name, not by count", () => {
    const names = aggregateTags(mixedEntries).map(([tag]) => tag);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("reflects draft filtering applied by the caller", () => {
    expect(aggregateTags(filterDrafts(mixedEntries))).toEqual([
      ["astro", 2],
      ["aws", 2],
      ["notes", 1],
      ["terraform", 1],
    ]);
  });

  it("handles an empty collection", () => {
    expect(aggregateTags(noEntries)).toEqual([]);
  });
});

describe("entries with no tags key", () => {
  // The tag helpers all guard with `?? []`. Prove the guards work rather than
  // leaving them as untested defensive code.
  it("filterByTag matches nothing instead of throwing", () => {
    expect(() => filterByTag(entryWithoutTags, "astro")).not.toThrow();
    expect(filterByTag(entryWithoutTags, "astro")).toEqual([]);
  });

  it("uniqueTags returns no tags instead of throwing", () => {
    expect(uniqueTags(entryWithoutTags)).toEqual([]);
  });

  it("aggregateTags returns no counts instead of throwing", () => {
    expect(aggregateTags(entryWithoutTags)).toEqual([]);
  });

  it("filterDrafts and sortByDate are unaffected", () => {
    expect(filterDrafts(entryWithoutTags)).toHaveLength(1);
    expect(sortByDate(entryWithoutTags)).toHaveLength(1);
  });
});
