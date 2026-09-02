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
