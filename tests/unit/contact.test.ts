import { describe, it, expect } from "vitest";
import { CONTACT, contactBlock } from "../../src/utils/contact";

describe("CONTACT", () => {
  it("carries the identity and the three ways to reach Jon", () => {
    expect(CONTACT.name).toBe("Jon Green");
    expect(CONTACT.email).toBe("hello@jgreen.one");
    expect(CONTACT.github).toBe("https://github.com/jgreen01");
    expect(CONTACT.linkedin).toBe("https://linkedin.com/in/jgreen01");
  });

  it("keeps a display form of each link without the scheme", () => {
    expect(CONTACT.githubHandle).toBe("github.com/jgreen01");
    expect(CONTACT.linkedinHandle).toBe("linkedin.com/in/jgreen01");
  });

  it("uses absolute URLs, so they work from a Markdown file read out of context", () => {
    for (const url of [CONTACT.github, CONTACT.linkedin]) {
      expect(url).toMatch(/^https:\/\//);
    }
  });
});

describe("contactBlock", () => {
  const md = contactBlock();

  // A Markdown twin is read with no surrounding page. Whoever quotes it needs
  // to know whose words these are and how to reach him, or the citation dies
  // with the file.
  it("names the author", () => {
    expect(md).toContain("Jon Green");
  });

  it("includes all three contact routes", () => {
    expect(md).toContain("hello@jgreen.one");
    expect(md).toContain("github.com/jgreen01");
    expect(md).toContain("linkedin.com/in/jgreen01");
  });

  it("opens with a horizontal rule so it reads as a footer, not as body text", () => {
    expect(md.trimStart().startsWith("---")).toBe(true);
  });

  it("renders the email as a mailto link", () => {
    expect(md).toContain("mailto:hello@jgreen.one");
  });

  it("ends with a single trailing newline", () => {
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
});
