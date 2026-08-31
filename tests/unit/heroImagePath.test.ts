import { describe, it, expect } from "vitest";
import { heroImagePath } from "../../src/utils/heroImagePath";

describe("heroImagePath", () => {
  describe("already-absolute paths", () => {
    it("returns a site-absolute path unchanged", () => {
      expect(heroImagePath("/images/placeholder-project.png")).toBe(
        "/images/placeholder-project.png",
      );
    });

    it("does not double up the collection prefix on an absolute path", () => {
      expect(heroImagePath("/entries/images/hero.png")).toBe("/entries/images/hero.png");
    });
  });

  describe("collection-relative paths", () => {
    it("prepends /entries/ to a bare path", () => {
      expect(heroImagePath("images/hero.png")).toBe("/entries/images/hero.png");
    });

    it("uses the supplied collection name", () => {
      expect(heroImagePath("images/hero.png", "projects")).toBe(
        "/projects/images/hero.png",
      );
    });

    it("defaults the collection to 'entries'", () => {
      expect(heroImagePath("hero.png")).toBe("/entries/hero.png");
    });
  });

  describe("external URLs", () => {
    // The schema documents heroImage as "Path in /public or external image URL",
    // so an absolute URL must survive untouched rather than being prefixed.
    it.each([
      "https://example.com/hero.png",
      "http://example.com/hero.png",
      "//cdn.example.com/hero.png",
    ])("returns %s unchanged", (url) => {
      expect(heroImagePath(url)).toBe(url);
    });
  });

  describe("absent values", () => {
    it.each([undefined, "", "   "])("returns undefined for %o", (value) => {
      expect(heroImagePath(value)).toBeUndefined();
    });
  });

  describe("whitespace handling", () => {
    it("trims surrounding whitespace before resolving", () => {
      expect(heroImagePath("  images/hero.png  ")).toBe("/entries/images/hero.png");
    });
  });
});
