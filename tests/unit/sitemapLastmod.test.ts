import { describe, it, expect } from "vitest";
import { parseEntry, lastmodFor, type EntryMeta } from "../../src/utils/sitemapLastmod";

const frontmatter = (body: string) => `---\n${body}\n---\n\nProse.\n`;

describe("parseEntry", () => {
  it("reads the publish date", () => {
    const entry = parseEntry("a-post", frontmatter('title: "A"\npubDate: 2026-09-03\ndraft: false'));
    expect(entry?.date).toBe("2026-09-03");
  });

  // An updated post is what a crawler should re-fetch, so the later date wins.
  it("prefers updatedDate over pubDate", () => {
    const entry = parseEntry(
      "a-post",
      frontmatter("pubDate: 2025-09-21\nupdatedDate: 2026-01-15\ndraft: false"),
    );
    expect(entry?.date).toBe("2026-01-15");
  });

  it("accepts a quoted date", () => {
    const entry = parseEntry("a-post", frontmatter('pubDate: "2026-09-03"\ndraft: false'));
    expect(entry?.date).toBe("2026-09-03");
  });

  it("keeps only the date half of a full timestamp", () => {
    const entry = parseEntry("a-post", frontmatter("pubDate: 2026-09-03T12:30:00Z\ndraft: false"));
    expect(entry?.date).toBe("2026-09-03");
  });

  it("reads the tags", () => {
    const entry = parseEntry(
      "a-post",
      frontmatter('pubDate: 2026-09-03\ntags: ["astro", "aws"]\ndraft: false'),
    );
    expect(entry?.tags).toEqual(["astro", "aws"]);
  });

  it("has no tags when the list is absent", () => {
    const entry = parseEntry("a-post", frontmatter("pubDate: 2026-09-03\ndraft: false"));
    expect(entry?.tags).toEqual([]);
  });

  it("records the draft flag", () => {
    const entry = parseEntry("a-post", frontmatter("pubDate: 2026-09-03\ndraft: true"));
    expect(entry?.draft).toBe(true);
  });

  it("treats a missing draft flag as published", () => {
    expect(parseEntry("a-post", frontmatter("pubDate: 2026-09-03"))?.draft).toBe(false);
  });

  it("returns null when there is no frontmatter at all", () => {
    expect(parseEntry("a-post", "Just prose, no frontmatter.\n")).toBeNull();
  });

  // Better to omit a lastmod than to invent one from an unparseable file.
  it("returns null when there is no usable date", () => {
    expect(parseEntry("a-post", frontmatter('title: "No date here"'))).toBeNull();
  });
});

describe("lastmodFor", () => {
  const entries: EntryMeta[] = [
    { slug: "newest", date: "2026-09-03", tags: ["astro"], draft: false },
    { slug: "middle", date: "2026-08-31", tags: ["aws", "astro"], draft: false },
    { slug: "oldest", date: "2025-09-21", tags: ["aws"], draft: false },
  ];

  it("dates an entry page by its own entry", () => {
    expect(lastmodFor("/entries/middle/", entries)).toBe("2026-08-31");
  });

  it("matches an entry page with no trailing slash", () => {
    expect(lastmodFor("/entries/middle", entries)).toBe("2026-08-31");
  });

  it("dates a sub-route of an entry, such as a transcript, by that entry", () => {
    expect(lastmodFor("/entries/middle/transcript/", entries)).toBe("2026-08-31");
  });

  // A listing changes whenever any entry it lists changes.
  it.each(["/", "/blog/", "/projects/", "/entries/", "/tags/"])(
    "dates the listing %s by the newest entry",
    (path) => {
      expect(lastmodFor(path, entries)).toBe("2026-09-03");
    },
  );

  it("dates a tag page by the newest entry carrying that tag", () => {
    expect(lastmodFor("/tags/aws/", entries)).toBe("2026-08-31");
  });

  // Inventing a date for a page we cannot date would be a false signal, and a
  // crawler that learns lastmod is unreliable stops trusting all of them.
  it.each(["/about/", "/contact/", "/404/"])("gives %s no lastmod", (path) => {
    expect(lastmodFor(path, entries)).toBeUndefined();
  });

  it("gives an unknown entry slug no lastmod", () => {
    expect(lastmodFor("/entries/no-such-entry/", entries)).toBeUndefined();
  });

  it("gives a tag nothing carries no lastmod", () => {
    expect(lastmodFor("/tags/nonexistent/", entries)).toBeUndefined();
  });

  it("ignores drafts when dating a listing", () => {
    const withDraft: EntryMeta[] = [
      ...entries,
      { slug: "unreleased", date: "2027-01-01", tags: ["astro"], draft: true },
    ];
    expect(lastmodFor("/", withDraft)).toBe("2026-09-03");
  });

  it("returns undefined for everything when there are no entries", () => {
    expect(lastmodFor("/", [])).toBeUndefined();
  });
});
