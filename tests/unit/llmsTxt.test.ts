import { describe, it, expect } from "vitest";
import { llmsTxt } from "../../src/utils/llmsTxt";
import { mixedEntries } from "../fixtures/entries";

const published = mixedEntries.filter((e) => !e.data.draft);

describe("llmsTxt", () => {
  const text = llmsTxt(published);

  describe("format", () => {
    // The convention: an H1 for the site, a blockquote summary, then H2
    // sections of markdown links with descriptions.
    it("opens with a single H1", () => {
      expect(text.split("\n")[0]).toMatch(/^# /);
    });

    it("has a blockquote summary directly under the title", () => {
      expect(text.split("\n").slice(0, 4).join("\n")).toMatch(/^> /m);
    });

    it("groups entries under H2 sections", () => {
      expect(text).toMatch(/^## /m);
    });

    it("lists each entry as a markdown link with a description", () => {
      expect(text).toMatch(/^- \[.+\]\(https:\/\/\S+\): .+$/m);
    });
  });

  describe("what it points at", () => {
    it("links to the .md files, not the HTML pages", () => {
      // The whole point is directing an agent to the cheap format. Entries end
      // in /index.md and transcripts in /transcript.md; what matters is that
      // nothing points at a rendered page.
      for (const [, url] of text.matchAll(/\]\((https:\/\/\S+)\)/g)) {
        expect(url).toMatch(/\.md$/);
      }
    });

    it("uses absolute URLs", () => {
      expect(text).not.toMatch(/\]\(\//);
    });

    it("includes every published entry", () => {
      for (const entry of published) {
        expect(text).toContain(entry.id);
      }
    });

    it("separates blog posts from projects", () => {
      expect(text).toMatch(/^## .*Blog/im);
      expect(text).toMatch(/^## .*Project/im);
    });
  });

  describe("drafts", () => {
    it("never lists a draft, even if one is passed in", () => {
      // Belt and braces: callers filter, but a leak here publishes unfinished
      // writing to every agent that reads the file.
      const withDraft = llmsTxt(mixedEntries);
      expect(withDraft).not.toContain("draft-blog");
    });
  });

  describe("ordering", () => {
    it("lists newest first within a section", () => {
      const blogSection = text.split(/^## /m).find((s) => /^Blog/i.test(s)) ?? "";
      const order = [...blogSection.matchAll(/\/entries\/([^/]+)\/index\.md/g)].map(
        (m) => m[1],
      );
      expect(order).toEqual(["second-newest-blog", "middle-blog", "oldest-blog"]);
    });
  });

  describe("edge cases", () => {
    it("omits a section that would be empty rather than printing a bare heading", () => {
      const onlyBlogs = published.filter((e) => e.data.kind === "blog");
      expect(llmsTxt(onlyBlogs)).not.toMatch(/^## .*Project/im);
    });

    it("produces a valid document with no entries at all", () => {
      const empty = llmsTxt([]);
      expect(empty).toMatch(/^# /);
      expect(empty).not.toContain("undefined");
    });

    it("ends with exactly one trailing newline", () => {
      expect(text.endsWith("\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
    });
  });
});

describe("llmsTxt transcripts section", () => {
  const entry = published[0];
  const transcript = {
    id: "a-talk",
    collection: "transcripts" as const,
    body: "words",
    data: {
      title: "A Talk",
      description: "Full transcript of a talk.",
      entry: entry.id,
      event: "Some Event",
      recordingUrl: "https://www.youtube.com/watch?v=abc",
      videoId: "abc",
      recordedDate: new Date("2025-12-11T00:00:00Z"),
      durationSeconds: 2928,
    },
  };
  const pairs = [{ transcript, entry }];

  it("omits the section entirely when there are no transcripts", () => {
    expect(llmsTxt(published, [])).not.toContain("## Transcripts");
  });

  it("adds a Transcripts section when there are some", () => {
    expect(llmsTxt(published, pairs)).toContain("## Transcripts");
  });

  it("points at the transcript's .md twin", () => {
    expect(llmsTxt(published, pairs)).toContain(`/entries/${entry.id}/transcript.md`);
  });

  it("labels the link as a transcript so an agent can tell it from the article", () => {
    expect(llmsTxt(published, pairs)).toMatch(/- \[A Talk — transcript\]/);
  });

  it("still lists the article itself", () => {
    expect(llmsTxt(published, pairs)).toContain(`/entries/${entry.id}/index.md`);
  });
});

describe("llms.txt identifies the author", () => {
  // An agent reading this file may never fetch a page. Without contact details
  // here, it has the site's content and no route back to whoever wrote it.
  const text = llmsTxt(published);

  it("names Jon and gives all three contact routes", () => {
    expect(text).toContain("Jon Green");
    expect(text).toContain("hello@jgreen.one");
    expect(text).toContain("github.com/jgreen01");
    expect(text).toContain("linkedin.com/in/jgreen01");
  });

  it("keeps them out of the link sections, which must stay .md URLs", () => {
    for (const [, url] of text.matchAll(/\]\((https:\/\/\S+)\)/g)) {
      expect(url).toMatch(/\.md$/);
    }
  });
});

describe("the site's own pages", () => {
  // Every page has a Markdown twin now, not only entries. An agent reading
  // this file should be able to reach the listings and the about page, not
  // just the writing.
  const out = () => llmsTxt(published);

  it("lists the pages under their own heading", () => {
    expect(out()).toMatch(/^## Pages$/m);
  });

  it.each([
    ["the homepage", "https://jgreen.one/index.md"],
    ["about", "https://jgreen.one/about/index.md"],
    ["blog", "https://jgreen.one/blog/index.md"],
    ["projects", "https://jgreen.one/projects/index.md"],
    ["all entries", "https://jgreen.one/entries/index.md"],
    ["tags", "https://jgreen.one/tags/index.md"],
    ["contact", "https://jgreen.one/contact/index.md"],
  ])("links %s", (_name, url) => {
    expect(out()).toContain(url);
  });

  it("gives each page a description, so the list is navigable", () => {
    const pages = out().split("## Pages")[1].split("##")[0].trim().split("\n");
    for (const line of pages.filter((l) => l.startsWith("-"))) {
      expect(line, `no description: ${line}`).toMatch(/\):\s+\S/);
    }
  });

  it("still points every link at a .md file", () => {
    for (const link of out().match(/\]\((https:[^)]+)\)/g) ?? []) {
      expect(link).toMatch(/\.md\)$/);
    }
  });

  it("puts the pages before the writing, since they are the way in", () => {
    const body = out();
    expect(body.indexOf("## Pages")).toBeLessThan(body.indexOf("## Blog posts"));
  });
});
