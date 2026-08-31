import { describe, it, expect } from "vitest";
import { entrySchema } from "../../src/content/schema";
import {
  validFullFrontmatter,
  minimalFrontmatter,
  overlongDescription,
  maxLengthDescription,
} from "../fixtures/frontmatter";

describe("entrySchema", () => {
  describe("valid input", () => {
    it("parses fully-populated frontmatter without error", () => {
      const result = entrySchema.parse(validFullFrontmatter);
      expect(result.title).toBe(validFullFrontmatter.title);
      expect(result.kind).toBe("blog");
      expect(result.tags).toEqual(["astro", "terraform", "aws"]);
      expect(result.heroImage).toBe("/media/how-this-website-was-built.png");
    });

    it("coerces pubDate and updatedDate strings into Date objects", () => {
      const result = entrySchema.parse(validFullFrontmatter);
      expect(result.pubDate).toBeInstanceOf(Date);
      expect(result.pubDate.getUTCFullYear()).toBe(2025);
      expect(result.updatedDate).toBeInstanceOf(Date);
    });

    it("accepts a description of exactly 160 characters", () => {
      expect(() =>
        entrySchema.parse({ ...minimalFrontmatter, description: maxLengthDescription }),
      ).not.toThrow();
    });
  });

  describe("required fields", () => {
    it.each(["title", "description", "pubDate"] as const)(
      "throws when %s is missing",
      (field) => {
        const input: Record<string, unknown> = { ...minimalFrontmatter };
        delete input[field];
        expect(() => entrySchema.parse(input)).toThrow();
      },
    );
  });

  describe("description length", () => {
    it("throws when description exceeds 160 characters", () => {
      expect(() =>
        entrySchema.parse({ ...minimalFrontmatter, description: overlongDescription }),
      ).toThrow();
    });
  });

  describe("kind", () => {
    it.each(["blog", "project"] as const)("accepts kind '%s'", (kind) => {
      expect(entrySchema.parse({ ...minimalFrontmatter, kind }).kind).toBe(kind);
    });

    it("throws on a kind outside the allowed set", () => {
      expect(() => entrySchema.parse({ ...minimalFrontmatter, kind: "note" })).toThrow();
    });

    it("defaults kind to 'blog' when omitted", () => {
      expect(entrySchema.parse(minimalFrontmatter).kind).toBe("blog");
    });
  });

  describe("defaults", () => {
    it("defaults draft to false", () => {
      expect(entrySchema.parse(minimalFrontmatter).draft).toBe(false);
    });

    it("defaults tags to an empty array", () => {
      expect(entrySchema.parse(minimalFrontmatter).tags).toEqual([]);
    });

    it("keeps an explicit draft: true", () => {
      expect(entrySchema.parse({ ...minimalFrontmatter, draft: true }).draft).toBe(true);
    });
  });

  describe("heroImage format", () => {
    // Pinned to one shape so a page-relative value can never reach a template,
    // where it would resolve against the current URL and 404 while still
    // looking like a rendered image.
    it.each([
      "/media/hero.png",
      "/media/nested/hero.jpg",
      "https://cdn.example.com/hero.png",
      "http://cdn.example.com/hero.png",
    ])("accepts %s", (heroImage) => {
      expect(entrySchema.parse({ ...minimalFrontmatter, heroImage }).heroImage).toBe(
        heroImage,
      );
    });

    it.each([
      ["a page-relative path", "images/hero.png"],
      ["a bare filename", "hero.png"],
      ["an unmanaged absolute path", "/images/hero.png"],
      ["a protocol-relative URL", "//cdn.example.com/hero.png"],
      ["an empty string", ""],
    ])("rejects %s", (_label, heroImage) => {
      expect(() => entrySchema.parse({ ...minimalFrontmatter, heroImage })).toThrow();
    });

    it("explains how to fix a bad value", () => {
      expect(() =>
        entrySchema.parse({ ...minimalFrontmatter, heroImage: "images/hero.png" }),
      ).toThrow(/media:push|\/media\//);
    });
  });

  describe("optional fields", () => {
    it("leaves updatedDate and heroImage undefined when absent", () => {
      const result = entrySchema.parse(minimalFrontmatter);
      expect(result.updatedDate).toBeUndefined();
      expect(result.heroImage).toBeUndefined();
    });
  });

  describe("type coercion guards", () => {
    it("throws when tags is not an array of strings", () => {
      expect(() => entrySchema.parse({ ...minimalFrontmatter, tags: "astro" })).toThrow();
    });

    it("throws when pubDate is not date-like", () => {
      expect(() =>
        entrySchema.parse({ ...minimalFrontmatter, pubDate: "not-a-date" }),
      ).toThrow();
    });
  });
});
