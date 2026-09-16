process.env.TZ = "America/Los_Angeles";

import { describe, it, expect } from "vitest";
import { listingMarkdown, tagsIndexMarkdown } from "../../src/utils/pageMarkdown";

const entries = [
  {
    id: "this-site",
    title: "jgreen.one: The Site as a Workbench",
    description: "A static site on AWS.",
    kind: "project" as const,
    pubDate: new Date("2026-09-03T00:00:00Z"),
    tags: ["astro", "aws"],
  },
  {
    id: "a-post",
    title: "A Post",
    description: "Some writing.",
    kind: "blog" as const,
    pubDate: new Date("2026-08-31T00:00:00Z"),
    tags: ["testing"],
  },
];

const listing = () =>
  listingMarkdown({
    title: "Blog",
    description: "Writing about engineering.",
    path: "/blog/",
    entries,
  });

describe("listingMarkdown", () => {
  it("opens with the title as an h1", () => {
    expect(listing().split("\n")[0]).toBe("# Blog");
  });

  it("carries the description as a blockquote, matching llms.txt shape", () => {
    expect(listing()).toContain("> Writing about engineering.");
  });

  // Read with no surrounding page, so the document must say where it came from.
  it("states its own canonical URL", () => {
    expect(listing()).toContain("https://jgreen.one/blog/");
  });

  it("links every entry by title", () => {
    for (const entry of entries) {
      expect(listing()).toContain(`[${entry.title}](https://jgreen.one/entries/${entry.id})`);
    }
  });

  // The twin is the useful destination for a machine, and it exists for every
  // entry — pointing at the HTML would send an agent back to the markup.
  it("points at the Markdown twin of each entry", () => {
    expect(listing()).toContain("https://jgreen.one/entries/this-site/index.md");
  });

  it("gives each entry its description", () => {
    expect(listing()).toContain("A static site on AWS.");
  });

  it("dates each entry, pinned to UTC", () => {
    expect(listing()).toContain("2026-09-03");
  });

  it("keeps the order it was given", () => {
    const body = listing();
    expect(body.indexOf("this-site")).toBeLessThan(body.indexOf("a-post"));
  });

  it("ends with the contact footer", () => {
    expect(listing()).toContain("hello@jgreen.one");
  });

  it("ends with exactly one trailing newline", () => {
    expect(listing().endsWith("\n")).toBe(true);
    expect(listing().endsWith("\n\n")).toBe(false);
  });

  it("never emits a literal undefined", () => {
    expect(listing()).not.toContain("undefined");
  });

  it("makes every URL absolute", () => {
    const relative = listing().match(/\]\((\/[^)]*)\)/g) ?? [];
    expect(relative, `relative links: ${relative.join(", ")}`).toHaveLength(0);
  });

  it("says so plainly when there is nothing to list", () => {
    const empty = listingMarkdown({
      title: "Blog",
      description: "Writing.",
      path: "/blog/",
      entries: [],
    });
    expect(empty).toContain("# Blog");
    expect(empty.toLowerCase()).toMatch(/nothing|no entries|empty/);
  });

  it("includes an intro when one is given", () => {
    const withIntro = listingMarkdown({
      title: "Home",
      description: "d",
      path: "/",
      entries,
      intro: "Senior software developer.",
    });
    expect(withIntro).toContain("Senior software developer.");
  });
});

describe("tagsIndexMarkdown", () => {
  const tags = [
    { tag: "astro", count: 3 },
    { tag: "aws", count: 2 },
  ];
  const index = () => tagsIndexMarkdown({ path: "/tags/", tags });

  it("opens with a heading", () => {
    expect(index().split("\n")[0]).toMatch(/^# /);
  });

  it("links every tag to its page", () => {
    expect(index()).toContain("[astro](https://jgreen.one/tags/astro/)");
  });

  it("gives the count for each tag", () => {
    expect(index()).toMatch(/astro.*3/);
  });

  it("escapes a tag containing markdown syntax", () => {
    const odd = tagsIndexMarkdown({ path: "/tags/", tags: [{ tag: "c++", count: 1 }] });
    expect(odd).toContain("c++");
  });

  it("ends with the contact footer and one newline", () => {
    expect(index()).toContain("hello@jgreen.one");
    expect(index().endsWith("\n")).toBe(true);
    expect(index().endsWith("\n\n")).toBe(false);
  });
});
