import { describe, it, expect } from "vitest";
import { tagHref } from "../../src/utils/tags";

describe("tagHref", () => {
  // The unslashed form serves a 200 whose canonical points at the slashed URL,
  // so linking it asks a crawler to fetch a duplicate shape for nothing.
  it("ends in a slash", () => {
    expect(tagHref("astro")).toBe("/tags/astro/");
  });

  it("is site-absolute, so it resolves the same from any depth", () => {
    expect(tagHref("aws").startsWith("/tags/")).toBe(true);
  });

  it("percent-encodes characters that are not safe in a path segment", () => {
    expect(tagHref("c++")).toBe("/tags/c%2B%2B/");
    expect(tagHref("data science")).toBe("/tags/data%20science/");
    expect(tagHref("a/b")).toBe("/tags/a%2Fb/");
  });

  // Hyphens are the common case in this content set; encoding them would break
  // every existing tag route.
  it("leaves hyphens and digits alone", () => {
    expect(tagHref("open-data")).toBe("/tags/open-data/");
    expect(tagHref("d3")).toBe("/tags/d3/");
  });

  it("never emits a double slash", () => {
    expect(tagHref("astro")).not.toContain("//");
  });
});
