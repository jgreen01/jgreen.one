import { describe, it, expect } from "vitest";
import { seoMeta, SEO_DEFAULTS, markdownTwinUrl } from "../../src/utils/seoMeta";

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

    it("points at the managed default OG asset", () => {
      expect(seoMeta({}).image).toBe("https://jgreen.one/media/og-default.png");
    });

    it("preserves non-ASCII characters in a filename verbatim", () => {
      // joinUrl is string-based rather than `new URL()` precisely so it cannot
      // percent-encode a filename into one that does not exist on disk.
      expect(seoMeta({ image: "/media/café–hero.png" }).image).toBe(
        "https://jgreen.one/media/café–hero.png",
      );
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

describe("the Markdown twin link", () => {
  // The llms.txt specification recommends advertising a Markdown version three
  // ways: a URL convention, a rel="alternate" link element, and a Link header.
  // The convention has always held here; this is the second.
  it("derives the twin from the canonical URL", () => {
    expect(seoMeta({ url: "/entries/this-site/" }).markdownUrl).toBe(
      "https://jgreen.one/entries/this-site/index.md",
    );
  });

  it("handles a path with no trailing slash", () => {
    expect(seoMeta({ url: "/about" }).markdownUrl).toBe("https://jgreen.one/about/index.md");
  });

  it("handles the site root", () => {
    expect(seoMeta({ url: "/" }).markdownUrl).toBe("https://jgreen.one/index.md");
  });

  it("is absolute, like every other URL here", () => {
    expect(seoMeta({ url: "/blog/" }).markdownUrl).toMatch(/^https:\/\//);
  });

  // The error page has no twin — it is served by CloudFront's error response
  // rather than reached by a rewrite — so it must not advertise one.
  it("is absent when a page opts out", () => {
    expect(seoMeta({ url: "/404/", markdown: false }).markdownUrl).toBeUndefined();
  });

  it("is present by default", () => {
    expect(seoMeta({ url: "/blog/" }).markdownUrl).toBeTruthy();
  });
});

describe("markdownTwinUrl", () => {
  // One rule shared by the <link rel=alternate>, the visible copy control and
  // the edge function. A second copy is a second chance to disagree.
  it("appends index.md to a directory-style URL", () => {
    expect(markdownTwinUrl("https://jgreen.one/about/")).toBe(
      "https://jgreen.one/about/index.md",
    );
  });

  it("adds the missing slash first", () => {
    expect(markdownTwinUrl("https://jgreen.one/about")).toBe(
      "https://jgreen.one/about/index.md",
    );
  });

  it("works on a bare path, which is what a component has", () => {
    expect(markdownTwinUrl("/entries/this-site/")).toBe("/entries/this-site/index.md");
    expect(markdownTwinUrl("/entries/this-site")).toBe("/entries/this-site/index.md");
  });

  it("handles the root", () => {
    expect(markdownTwinUrl("/")).toBe("/index.md");
  });

  it("never doubles the slash", () => {
    expect(markdownTwinUrl("/about/")).not.toContain("//index.md");
  });
});
