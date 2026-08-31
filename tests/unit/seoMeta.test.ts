import { describe, it, expect } from "vitest";
import { seoMeta, SEO_DEFAULTS } from "../../src/utils/seoMeta";

describe("seoMeta", () => {
  describe("defaults", () => {
    const meta = seoMeta({});

    it("applies the default title", () => {
      expect(meta.title).toBe(SEO_DEFAULTS.title);
      expect(meta.title).toContain("Jon Green");
    });

    it("applies the default description", () => {
      expect(meta.description).toBe(SEO_DEFAULTS.description);
      expect(meta.description.length).toBeGreaterThan(0);
    });

    it("defaults the canonical URL to the site root", () => {
      expect(meta.url).toBe("https://jgreen.one/");
    });

    it("defaults the OG image to the site-absolute default image", () => {
      expect(meta.image).toBe(`https://jgreen.one${SEO_DEFAULTS.image}`);
    });

    it("defaults type to 'website'", () => {
      expect(meta.type).toBe("website");
    });

    it("defaults site to https://jgreen.one", () => {
      expect(meta.site).toBe("https://jgreen.one");
    });
  });

  describe("canonical URL construction", () => {
    it.each([
      ["/about", "https://jgreen.one/about"],
      ["/blog/", "https://jgreen.one/blog/"],
      ["/entries/how-this-site-was-made/", "https://jgreen.one/entries/how-this-site-was-made/"],
      ["/tags/astro/", "https://jgreen.one/tags/astro/"],
    ])("maps %s to %s", (url, expected) => {
      expect(seoMeta({ url }).url).toBe(expected);
    });

    it("resolves a bare path against the site root", () => {
      expect(seoMeta({ url: "about" }).url).toBe("https://jgreen.one/about");
    });
  });

  describe("OG image construction", () => {
    it("makes a site-relative image absolute", () => {
      expect(seoMeta({ image: "/og/post.png" }).image).toBe("https://jgreen.one/og/post.png");
    });

    it("preserves non-ASCII characters in the image filename verbatim", () => {
      // The real default asset is literally `public/og/home_1024×1024.png`.
      // Percent-encoding it here would point at a file that does not exist.
      expect(seoMeta({}).image).toBe("https://jgreen.one/og/home_1024×1024.png");
    });

    it("leaves an already-absolute image URL untouched", () => {
      const external = "https://cdn.example.com/og/post.png";
      expect(seoMeta({ image: external }).image).toBe(external);
    });
  });

  describe("custom site", () => {
    const site = "https://staging.jgreen.one";

    it("uses the custom site for the canonical URL", () => {
      expect(seoMeta({ site, url: "/about" }).url).toBe("https://staging.jgreen.one/about");
    });

    it("uses the custom site for the OG image", () => {
      expect(seoMeta({ site, image: "/og/post.png" }).image).toBe(
        "https://staging.jgreen.one/og/post.png",
      );
    });

    it("reports the custom site back", () => {
      expect(seoMeta({ site }).site).toBe(site);
    });

    it("never produces a doubled slash when the site has a trailing slash", () => {
      const meta = seoMeta({ site: "https://staging.jgreen.one/", image: "/og/post.png" });
      expect(meta.image).toBe("https://staging.jgreen.one/og/post.png");
      expect(meta.image).not.toContain("//og");
    });
  });

  describe("explicit overrides", () => {
    it("passes through title, description and type", () => {
      const meta = seoMeta({
        title: "Custom Title",
        description: "Custom description.",
        type: "article",
      });
      expect(meta.title).toBe("Custom Title");
      expect(meta.description).toBe("Custom description.");
      expect(meta.type).toBe("article");
    });

    it("falls back to defaults for undefined props rather than rendering 'undefined'", () => {
      const meta = seoMeta({ title: undefined, description: undefined, image: undefined });
      expect(meta.title).toBe(SEO_DEFAULTS.title);
      expect(meta.description).toBe(SEO_DEFAULTS.description);
      expect(meta.image).not.toContain("undefined");
    });
  });

  describe("output invariants", () => {
    it.each([
      {},
      { url: "/about" },
      { title: "T", description: "D", url: "/blog/", image: "/og/x.png", type: "article" as const },
    ])("never emits an undefined or empty field for %o", (props) => {
      const meta = seoMeta(props);
      for (const [key, value] of Object.entries(meta)) {
        expect(value, `${key} must be a non-empty string`).toBeTruthy();
        expect(String(value)).not.toContain("undefined");
        expect(String(value)).not.toContain("[object Object]");
      }
    });
  });
});
