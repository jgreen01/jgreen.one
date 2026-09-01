import { describe, it, expect } from "vitest";
import { entryMarkdown } from "../../src/utils/entryMarkdown";

const entry = {
  id: "how-this-site-was-made",
  collection: "entries" as const,
  body: "First paragraph.\n\n## A heading\n\nMore prose.\n",
  data: {
    title: "How This Site Was Built",
    description: "A technical deep-dive into the infrastructure.",
    pubDate: new Date("2025-09-21T00:00:00Z"),
    updatedDate: new Date("2026-01-15T00:00:00Z"),
    kind: "blog" as const,
    tags: ["astro", "aws"],
    draft: false,
  },
};

describe("entryMarkdown", () => {
  describe("standing alone", () => {
    // The file is read out of context, with no surrounding page and no
    // frontmatter parser. Everything needed to understand and cite it has to be
    // in the text itself.
    const md = entryMarkdown(entry);

    it("opens with the title as an h1", () => {
      expect(md.split("\n")[0]).toBe("# How This Site Was Built");
    });

    it("includes the description", () => {
      expect(md).toContain("A technical deep-dive into the infrastructure.");
    });

    it("includes the canonical URL so the source can be cited", () => {
      expect(md).toContain("https://jgreen.one/entries/how-this-site-was-made");
    });

    it("includes the publish date in ISO form", () => {
      expect(md).toContain("2025-09-21");
    });

    it("includes the updated date when there is one", () => {
      expect(md).toContain("2026-01-15");
    });

    it("includes the tags", () => {
      expect(md).toContain("astro");
      expect(md).toContain("aws");
    });

    it("ends with the body", () => {
      expect(md.trimEnd().endsWith("More prose.")).toBe(true);
    });
  });

  describe("the body is passed through unchanged", () => {
    it("preserves the markdown exactly", () => {
      // Same words as the HTML, in a lighter format — anything else would be
      // serving different content, which is the thing this whole task avoids.
      expect(entryMarkdown(entry)).toContain(entry.body.trim());
    });

    it("preserves code fences", () => {
      const withCode = { ...entry, body: "Text\n\n```bash\nnpm run build\n```\n" };
      expect(entryMarkdown(withCode)).toContain("```bash\nnpm run build\n```");
    });

    it("does not HTML-escape anything", () => {
      const withEntities = { ...entry, body: "a && b < c > d & e\n" };
      const md = entryMarkdown(withEntities);
      expect(md).toContain("a && b < c > d & e");
      expect(md).not.toContain("&amp;");
      expect(md).not.toContain("&#");
    });
  });

  describe("optional fields", () => {
    it("omits the updated line when there is no updatedDate", () => {
      const { updatedDate, ...data } = entry.data;
      const md = entryMarkdown({ ...entry, data });
      expect(md).not.toMatch(/updated/i);
    });

    it("omits the tag line when there are no tags", () => {
      const md = entryMarkdown({ ...entry, data: { ...entry.data, tags: [] } });
      expect(md).not.toMatch(/^tags:/im);
    });

    it("still produces a usable document with only the required fields", () => {
      const md = entryMarkdown({
        id: "minimal",
        collection: "entries",
        body: "Just prose.\n",
        data: {
          title: "Minimal",
          description: "Short.",
          pubDate: new Date("2025-08-14T00:00:00Z"),
          kind: "blog",
          tags: [],
          draft: false,
        },
      });
      expect(md).toContain("# Minimal");
      expect(md).toContain("Just prose.");
      expect(md).toContain("https://jgreen.one/entries/minimal");
    });
  });

  describe("output hygiene", () => {
    it("ends with exactly one trailing newline", () => {
      const md = entryMarkdown(entry);
      expect(md.endsWith("\n")).toBe(true);
      expect(md.endsWith("\n\n")).toBe(false);
    });

    it("never emits the literal string undefined", () => {
      const { updatedDate, ...data } = entry.data;
      expect(entryMarkdown({ ...entry, data })).not.toContain("undefined");
    });

    it("keeps the preamble small", () => {
      // The point of the format is fewer tokens, so the metadata block must stay
      // a header rather than becoming a meaningful share of the payload.
      // Measured absolutely: comparing it to the body length says nothing,
      // because a short body makes any fixed preamble look large.
      const preamble = entryMarkdown(entry).split("\n---\n")[0];
      expect(preamble.length).toBeLessThan(400);
    });
  });
});
