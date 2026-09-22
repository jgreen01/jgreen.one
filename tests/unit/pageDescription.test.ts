import { describe, it, expect } from "vitest";
import { tagDescription, listingDescription } from "../../src/utils/pageDescription";
import { SEO_DEFAULTS } from "../../src/utils/seoMeta";

describe("tagDescription", () => {
  it("names the tag, so two tag pages never read alike", () => {
    expect(tagDescription("astro", 4)).toContain("astro");
    expect(tagDescription("astro", 4)).not.toBe(tagDescription("aws", 4));
  });

  it("counts in the singular for one entry", () => {
    expect(tagDescription("tailwind", 1)).toContain("1 entry");
    expect(tagDescription("tailwind", 1)).not.toContain("entries");
  });

  it("counts in the plural beyond one", () => {
    expect(tagDescription("astro", 4)).toContain("4 entries");
  });

  it("survives a tag with no entries", () => {
    const text = tagDescription("orphan", 0);
    expect(text).toContain("orphan");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("NaN");
  });

  // This is the bug being fixed: 27 of 36 pages emitted the site-wide default.
  it("never returns the site default", () => {
    expect(tagDescription("astro", 4)).not.toBe(SEO_DEFAULTS.description);
  });

  // Google truncates around 155-160 characters. Longer is not wrong, but the
  // distinguishing part must survive the cut, so keep the whole thing short.
  it("stays inside what a search result will show", () => {
    expect(tagDescription("data-visualization", 12).length).toBeLessThan(160);
  });

  it("reads as a sentence", () => {
    expect(tagDescription("aws", 4)).toMatch(/\.$/);
  });
});

describe("listingDescription", () => {
  it.each(["blog", "projects", "entries", "tags"] as const)("describes %s", (kind) => {
    const text = listingDescription(kind, 6);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toContain("undefined");
    expect(text).toMatch(/\.$/);
  });

  it("gives each listing its own wording", () => {
    const all = (["blog", "projects", "entries", "tags"] as const).map((k) =>
      listingDescription(k, 6),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("never returns the site default", () => {
    for (const kind of ["blog", "projects", "entries", "tags"] as const) {
      expect(listingDescription(kind, 6)).not.toBe(SEO_DEFAULTS.description);
    }
  });

  it("stays inside what a search result will show", () => {
    for (const kind of ["blog", "projects", "entries", "tags"] as const) {
      expect(listingDescription(kind, 126).length).toBeLessThan(160);
    }
  });

  it("counts in the singular for one", () => {
    expect(listingDescription("blog", 1)).not.toMatch(/1 (posts|entries|projects|tags)\b/);
  });
});
