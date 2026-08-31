import { describe, it, expect } from "vitest";
import { heroImagePath } from "../../src/utils/heroImagePath";

describe("heroImagePath", () => {
  describe("managed media paths", () => {
    it("returns a /media/ path unchanged", () => {
      expect(heroImagePath("/media/how-this-website-was-built.png")).toBe(
        "/media/how-this-website-was-built.png",
      );
    });

    it("accepts any site-absolute path, not just /media/", () => {
      // The schema narrows content to /media/, but the helper only cares that
      // the value is absolute — it is also used for the default OG image.
      expect(heroImagePath("/og-default.png")).toBe("/og-default.png");
    });
  });

  describe("external URLs", () => {
    // The schema documents an external https URL as the other allowed shape.
    it.each([
      "https://example.com/hero.png",
      "http://example.com/hero.png",
      "//cdn.example.com/hero.png",
    ])("returns %s unchanged", (url) => {
      expect(heroImagePath(url)).toBe(url);
    });
  });

  describe("absent values", () => {
    it.each([undefined, null, "", "   "])("returns undefined for %o", (value) => {
      expect(heroImagePath(value)).toBeUndefined();
    });
  });

  describe("whitespace", () => {
    it("trims before returning", () => {
      expect(heroImagePath("  /media/hero.png  ")).toBe("/media/hero.png");
    });
  });

  describe("values the schema should already have rejected", () => {
    // A page-relative src resolves against the current URL, so on
    // /entries/<slug>/ it silently 404s. Rendering nothing is better than
    // rendering a broken image; the schema's refine() is the real guard and
    // fails the build first.
    it.each(["images/hero.png", "hero.png", "./hero.png", "../hero.png"])(
      "returns undefined for the relative path %s rather than emitting it",
      (value) => {
        expect(heroImagePath(value)).toBeUndefined();
      },
    );
  });
});
