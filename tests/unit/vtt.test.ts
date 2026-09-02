import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseVtt,
  resolveSpeaker,
  toFragments,
  cleanTranscriptText,
  toParagraphs,
  formatTimestamp,
  renderTranscriptBody,
  replaceMarkdownBody,
  applyCorrections,
  vttToTranscript,
  siblingPath,
} from "../../scripts/lib/vtt.mjs";

const fixture = readFileSync(
  fileURLToPath(new URL("../fixtures/talk-excerpt.vtt", import.meta.url)),
  "utf8",
);

describe("parseVtt", () => {
  const cues = parseVtt(fixture);

  it("returns one cue per timed block, dropping the WEBVTT header", () => {
    expect(cues).toHaveLength(11);
    expect(JSON.stringify(cues)).not.toContain("WEBVTT");
    expect(JSON.stringify(cues)).not.toContain("Kind: captions");
  });

  it("parses the start time into seconds", () => {
    expect(cues[0].start).toBeCloseTo(0.663, 3);
    expect(cues[9].start).toBeCloseTo(163.59, 2);
  });

  it("joins a cue's wrapped lines into one string", () => {
    expect(cues[0].text).toBe("[JON GREEN] So I'm Jon Green, and I'll be presenting a");
  });

  it("keeps the speaker tag in the text for the caller to split on", () => {
    expect(cues[9].text).toContain("[TRUCKER HATCH]");
  });

  it("ignores an empty document", () => {
    expect(parseVtt("WEBVTT\n\n")).toEqual([]);
  });
});

describe("resolveSpeaker", () => {
  it.each([
    ["JON GREEN", "Jon Green"],
    ["MODERATOR", "Moderator"],
    ["AUDIENCE MEMBER", "Audience"],
    ["AUDIENCE MEMBER ONE", "Audience"],
    ["AUDIENCE MEMBER TWO", "Audience"],
  ])("maps %s to %s", (tag, expected) => {
    expect(resolveSpeaker(tag, "some words")).toBe(expected);
  });

  it("falls back to Audience for an unrecognised tag", () => {
    expect(resolveSpeaker("SOMEONE ELSE", "a question")).toBe("Audience");
  });

  // The caption track uses one garbled tag for two different people. It is the
  // speaker for most of the talk, but the closing hand-back is the moderator.
  describe("the ambiguous TRUCKER HATCH tag", () => {
    it("resolves to the speaker mid-talk", () => {
      expect(resolveSpeaker("TRUCKER HATCH", "Command line, it can run any command")).toBe(
        "Jon Green",
      );
    });

    it.each([
      "All Right. I think we've hit our end of the time for the session.",
      "Awesome. Thank you so much.",
    ])("resolves to the moderator for the wrap-up: %s", (text) => {
      expect(resolveSpeaker("TRUCKER HATCH", text)).toBe("Moderator");
    });
  });
});

describe("toFragments", () => {
  const fragments = toFragments(parseVtt(fixture));

  it("attributes untagged cues to whoever was speaking", () => {
    expect(fragments[0].speaker).toBe("Jon Green");
    expect(fragments[1].speaker).toBe("Jon Green");
  });

  it("strips the speaker tag out of the text", () => {
    expect(fragments[0].text).not.toContain("[JON GREEN]");
    expect(fragments[0].text).toContain("So I'm Jon Green");
  });

  it("carries each fragment's start time through", () => {
    expect(fragments[0].start).toBeCloseTo(0.663, 3);
  });
});

describe("cleanTranscriptText", () => {
  it("collapses a repeated-word stutter", () => {
    expect(cleanTranscriptText("less on the-- the tool")).toBe("less on the tool");
  });

  it("collapses a prefix stutter, keeping the completed word", () => {
    expect(cleanTranscriptText("what I built this work-- workflow on top of")).toBe(
      "what I built this workflow on top of",
    );
  });

  it.each([
    ["Cloud Code is the best", "Claude Code is the best"],
    ["cloud code knows SQL", "Claude Code knows SQL"],
    ["Maybe even Kero CLI", "Maybe even Kiro CLI"],
    ["Pacman sometimes has trouble", "Pac-Man sometimes has trouble"],
  ])("corrects mis-transcribed product names: %s", (input, expected) => {
    expect(cleanTranscriptText(input)).toBe(expected);
  });

  it.each([
    ["there's there's no magic here", "there's no magic here"],
    ["I'm I'm not a magician", "I'm not a magician"],
    ["Let's let's do Frogger first", "Let's do Frogger first"],
    ["so all All right", "so all right"],
  ])("collapses a repeat across apostrophes and case: %s", (input, expected) => {
    expect(cleanTranscriptText(input)).toBe(expected);
  });

  it("does not leave double spaces or space before punctuation", () => {
    expect(cleanTranscriptText("a  b , c")).toBe("a b, c");
  });
});

describe("toParagraphs", () => {
  it("starts a new paragraph when the speaker changes", () => {
    const paragraphs = toParagraphs(
      [
        { start: 0, speaker: "Jon Green", text: "One." },
        { start: 5, speaker: "Audience", text: "A question?" },
        { start: 9, speaker: "Jon Green", text: "An answer." },
      ],
      { maxWords: 100 },
    );
    expect(paragraphs.map((p) => p.speaker)).toEqual(["Jon Green", "Audience", "Jon Green"]);
    expect(paragraphs[1].start).toBe(5);
  });

  it("breaks a long run at a sentence boundary once past maxWords", () => {
    const fragments = Array.from({ length: 12 }, (_, i) => ({
      start: i,
      speaker: "Jon Green",
      text: "word word word word word word word word word word.",
    }));
    const paragraphs = toParagraphs(fragments, { maxWords: 20 });
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const p of paragraphs) {
      expect(p.text.trim()).toMatch(/[.?!]$/);
    }
  });

  it("keeps the start time of the fragment each paragraph opens with", () => {
    const paragraphs = toParagraphs(
      [
        { start: 10, speaker: "Jon Green", text: "First." },
        { start: 20, speaker: "Audience", text: "Second." },
      ],
      { maxWords: 100 },
    );
    expect(paragraphs[0].start).toBe(10);
    expect(paragraphs[1].start).toBe(20);
  });
});

describe("formatTimestamp", () => {
  it.each([
    [0, "00:00"],
    [41, "00:41"],
    [96, "01:36"],
    [1466, "24:26"],
    [2928, "48:48"],
    [3661, "1:01:01"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatTimestamp(seconds)).toBe(expected);
  });

  it("floors fractional seconds", () => {
    expect(formatTimestamp(0.663)).toBe("00:00");
  });
});

describe("vttToTranscript", () => {
  // Captions wrap mid-sentence, so a spoken stutter routinely straddles two
  // cues. Cleaning each cue in isolation cannot see it.
  const straddling = [
    "WEBVTT",
    "",
    "00:00:00.000 --> 00:00:02.000",
    "less on the",
    "",
    "00:00:02.000 --> 00:00:04.000",
    "the tool itself.",
    "",
  ].join("\n");

  it("collapses a stutter split across two cues", () => {
    const body = vttToTranscript(straddling, { videoId: "abc" });
    expect(body).toContain("less on the tool itself.");
    expect(body).not.toContain("the the");
  });

  it("does not collapse a repeat across a sentence boundary", () => {
    const sentences = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:02.000",
      "I knew that. That was the point.",
      "",
    ].join("\n");
    expect(vttToTranscript(sentences, { videoId: "abc" })).toContain("that. That was");
  });
});

describe("siblingPath", () => {
  // Every input for a transcript shares its output's basename, so one --out
  // resolves the caption file and the corrections file too.
  it.each([
    ["/a/b/talk.md", ".vtt", "/a/b/talk.vtt"],
    ["/a/b/talk.md", ".corrections.json", "/a/b/talk.corrections.json"],
    ["talk.md", ".vtt", "talk.vtt"],
  ])("maps %s + %s to %s", (out, extension, expected) => {
    expect(siblingPath(out, extension)).toBe(expected);
  });

  it("only strips a trailing .md, not one inside a directory name", () => {
    expect(siblingPath("/a/b.md/talk.md", ".vtt")).toBe("/a/b.md/talk.vtt");
  });

  it("appends when the path has no .md extension", () => {
    expect(siblingPath("/a/b/talk", ".vtt")).toBe("/a/b/talk.vtt");
  });
});

describe("applyCorrections", () => {
  // Generic rules cannot fix a one-off false start. Those live as data beside
  // the transcript so a regeneration reapplies them instead of losing them.
  it("applies literal replacements in order", () => {
    const { text } = applyCorrections("a rough passage here", [
      ["rough passage", "smooth passage"],
      ["smooth passage here", "smooth passage indeed"],
    ]);
    expect(text).toBe("a smooth passage indeed");
  });

  it("matches literally, not as a regular expression", () => {
    const { text } = applyCorrections("cost $5 (approx.)", [["$5 (approx.)", "$5"]]);
    expect(text).toBe("cost $5");
  });

  it("replaces every occurrence", () => {
    const { text } = applyCorrections("um yes um no", [["um ", ""]]);
    expect(text).toBe("yes no");
  });

  it("reports corrections that no longer match, so stale ones get noticed", () => {
    const { applied, unused } = applyCorrections("only this", [
      ["only", "just"],
      ["missing text", "x"],
    ]);
    expect(applied).toEqual([["only", "just"]]);
    expect(unused).toEqual([["missing text", "x"]]);
  });

  it("is a no-op given no corrections", () => {
    expect(applyCorrections("unchanged", []).text).toBe("unchanged");
  });
});

describe("replaceMarkdownBody", () => {
  // Regenerating must not cost the hand-written frontmatter, or nobody will
  // regenerate and the script rots.
  const doc = ["---", "title: A Talk", "videoId: abc", "---", "", "old body", ""].join("\n");

  it("keeps the frontmatter and swaps the body", () => {
    const out = replaceMarkdownBody(doc, "new body\n");
    expect(out).toContain("title: A Talk");
    expect(out).toContain("new body");
    expect(out).not.toContain("old body");
  });

  it("leaves exactly one blank line between frontmatter and body", () => {
    expect(replaceMarkdownBody(doc, "new body\n")).toContain("---\n\nnew body");
  });

  it("returns just the body when the document has no frontmatter", () => {
    expect(replaceMarkdownBody("no frontmatter here\n", "new body\n")).toBe("new body\n");
  });

  it("does not treat a --- inside the body as a frontmatter fence", () => {
    const out = replaceMarkdownBody(doc, "intro\n\n---\n\nafter a rule\n");
    expect(out).toContain("title: A Talk");
    expect(out).toContain("after a rule");
  });
});

describe("renderTranscriptBody", () => {
  const body = renderTranscriptBody(
    [
      { start: 0.663, speaker: "Jon Green", text: "Opening words." },
      { start: 41, speaker: "Jon Green", text: "Still me." },
      { start: 96, speaker: "Audience", text: "A question?" },
    ],
    { videoId: "cvs_OGmYidY" },
  );

  it("links each timestamp into the recording at whole seconds", () => {
    expect(body).toContain("[00:00](https://www.youtube.com/watch?v=cvs_OGmYidY&t=0s)");
    expect(body).toContain("[01:36](https://www.youtube.com/watch?v=cvs_OGmYidY&t=96s)");
  });

  it("labels a speaker only when they change", () => {
    expect(body.match(/\*\*Jon Green:\*\*/g)).toHaveLength(1);
    expect(body).toContain("**Audience:**");
  });

  it("separates paragraphs with a blank line", () => {
    expect(body).toContain("\n\n");
    expect(body.endsWith("\n")).toBe(true);
  });
});
