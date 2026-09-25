import { describe, it, expect } from "vitest";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { remarkCitations } from "../../src/utils/remarkCitations";

/**
 * Numbered citations ("…five years.[1]") link to the matching entry in the
 * article's References list, which is an ordered list under a "References"
 * heading. The Markdown itself is untouched: the article's text is exactly as
 * written, and the linking happens in the build.
 *
 * These run the plugin through Astro's own Markdown processor, the same
 * pipeline the site builds with, so GFM tables, autolinks and heading ids
 * behave here exactly as they do on the page.
 */
async function render(markdown: string, withPlugin = true) {
  const processor = await createMarkdownProcessor(withPlugin ? { remarkPlugins: [remarkCitations] } : {});
  return (await processor.render(markdown)).code;
}

const link = (n: number) => `<a href="#ref-${n}" class="citation" aria-label="Reference ${n}">[${n}]</a>`;

/**
 * U+2060 WORD JOINER. Browsers may break a line between "." and "[", which
 * strands a citation at the start of the next line, away from its sentence.
 * The joiner forbids that break and renders as nothing.
 */
const WJ = "\u2060";
const cite = (n: number) => WJ + link(n);

const REFERENCES = `
## References

1. Axios. "AI Jobs Danger." May 28, 2025. https://www.axios.com/example
2. Acemoglu, Daron, and Pascual Restrepo. "Automation and New Tasks." 2019.
3. Solow, Robert M. "We'd Better Watch Out." 1987.
`;

describe("remarkCitations", () => {
  it("links a citation to its reference", async () => {
    const html = await render(`Unemployment could reach 10–20 percent.[1]\n${REFERENCES}`);
    expect(html).toContain(`percent.${cite(1)}`);
  });

  it("gives each reference an id to land on", async () => {
    const html = await render(`Text.[1]\n${REFERENCES}`);
    expect(html).toContain('<li id="ref-1">');
    expect(html).toContain('<li id="ref-2">');
    expect(html).toContain('<li id="ref-3">');
  });

  it("keeps a citation on the same line as the word it follows", async () => {
    const html = await render(`within one to five years.[1] Next.\n${REFERENCES}`);
    expect(html).toContain(`years.${WJ}<a href="#ref-1"`);
  });

  it("adds no joiner after a space, where a line break is fine", async () => {
    const html = await render(`As shown in [1], and so on.\n${REFERENCES}`);
    expect(html).toContain(`in ${link(1)}`);
    expect(html).not.toContain(`in ${WJ}`);
  });

  it("links adjacent citations separately", async () => {
    const html = await render(`Retraining and income support.[1][2]\n${REFERENCES}`);
    expect(html).toContain(`support.${cite(1)}${cite(2)}`);
  });

  it("links every occurrence of the same citation", async () => {
    const html = await render(`First.[2] Later.[2]\n${REFERENCES}`);
    expect(html.split(link(2))).toHaveLength(3);
  });

  it("links citations inside table cells and emphasis", async () => {
    const md = `| Leader | Force |\n|---|---|\n| Amodei[1] | *displacement[3]* |\n${REFERENCES}`;
    const html = await render(md);
    expect(html).toContain(`Amodei${cite(1)}`);
    expect(html).toContain(`displacement${cite(3)}`);
  });

  it("leaves a number with no matching reference as plain text", async () => {
    const html = await render(`Text.[4] Text.[0]\n${REFERENCES}`);
    expect(html).toContain("Text.[4] Text.[0]");
    expect(html).not.toContain('href="#ref-4"');
  });

  it("leaves an article without a References heading exactly as it was", async () => {
    const md = "Array access like list[1] and a note.[1]\n\n1. An ordinary list\n";
    expect(await render(md)).toBe(await render(md, false));
  });

  it("never touches code", async () => {
    const md = "Use `items[1]` here.[1]\n\n```js\nconst x = items[1];\n```\n" + REFERENCES;
    const html = await render(md);
    expect(html).toContain("<code>items[1]</code>");
    // Shiki splits a highlighted block into per-token spans, so assert on the
    // block as a whole: no citation link anywhere inside it.
    const block = html.slice(html.indexOf("<pre"), html.indexOf("</pre>"));
    expect(block).toContain("items[");
    expect(block).not.toContain('href="#ref-');
    expect(html).toContain(`here.${cite(1)}`);
  });

  it("leaves existing links alone", async () => {
    const md = "See [the docs][1] and [a link](https://example.com).[2]\n\n[1]: https://docs.example.com\n" + REFERENCES;
    const html = await render(md);
    expect(html).toContain('<a href="https://docs.example.com">the docs</a>');
    expect(html).toContain('<a href="https://example.com">a link</a>');
    expect(html).toContain(`.${cite(2)}`);
  });

  it("does not link inside the References list itself", async () => {
    const md = "Text.[1]\n\n## References\n\n1. See also [2].\n2. Second.\n";
    const html = await render(md);
    expect(html).toContain("See also [2].");
  });

  it("follows a list that starts at a number other than 1", async () => {
    const md = "Text.[6]\n\n## References\n\n5. Fifth.\n6. Sixth.\n";
    const html = await render(md);
    expect(html).toContain('<li id="ref-5">');
    expect(html).toContain('<li id="ref-6">');
    expect(html).toContain(link(6));
  });

  it("finds the heading at any level and in any case", async () => {
    const html = await render("Text.[1]\n\n### references\n\n1. Only.\n");
    expect(html).toContain(link(1));
  });

  it("uses only the list directly under the heading", async () => {
    const md = "Text.[1]\n\n## References\n\n1. Only.\n\n## Afterword\n\n1. Not a reference.\n2. Nor this.\n";
    const html = await render(md);
    expect(html).toContain('<li id="ref-1">');
    expect(html).not.toContain('id="ref-2"');
  });
});
