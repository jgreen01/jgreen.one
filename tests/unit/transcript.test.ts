import { describe, it, expect } from "vitest";
import {
  formatDuration,
  pairTranscriptsWithEntries,
  transcriptMarkdown,
} from "../../src/utils/transcript";

const transcript = {
  id: "practical-workflow-for-ai-coding-assistants",
  collection: "transcripts" as const,
  body: "**[[00:00](https://www.youtube.com/watch?v=cvs_OGmYidY&t=0s)]** **Jon Green:** Hello.\n",
  data: {
    title: "A Practical Workflow for AI Coding Assistants",
    description: "Full transcript of the Converge 2025 session.",
    entry: "practical-workflow-for-ai-coding-assistants",
    event: "Stanford Converge 2025",
    eventUrl: "https://itcommunity.stanford.edu/converge/2025/sessions/x",
    recordingUrl: "https://www.youtube.com/watch?v=cvs_OGmYidY",
    videoId: "cvs_OGmYidY",
    recordedDate: new Date("2025-12-11T00:00:00Z"),
    durationSeconds: 2928,
    slidesUrl: "/media/practical-workflow-for-ai-coding-assistants.pdf",
    repoUrl: "https://code.stanford.edu/jon.b.green/ai-arcade-demo",
    editedNote: "Lightly edited for readability.",
  },
};

const publishedEntry = {
  id: "practical-workflow-for-ai-coding-assistants",
  collection: "entries" as const,
  data: {
    title: "A Practical Workflow for AI Coding Assistants",
    description: "My Converge 2025 talk.",
    pubDate: new Date("2025-12-11T00:00:00Z"),
    kind: "blog" as const,
    tags: ["ai"],
    draft: false,
  },
};

describe("formatDuration", () => {
  it.each([
    [2928, "48 minutes"],
    [60, "1 minute"],
    [90, "1 minute"],
    [3600, "1 hour"],
    [3660, "1 hour 1 minute"],
    [7500, "2 hours 5 minutes"],
  ])("renders %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("floors a partial minute rather than rounding up", () => {
    expect(formatDuration(119)).toBe("1 minute");
  });
});

describe("pairTranscriptsWithEntries", () => {
  it("pairs a transcript with the entry it names", () => {
    const pairs = pairTranscriptsWithEntries([transcript], [publishedEntry]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].transcript.id).toBe(transcript.id);
    expect(pairs[0].entry.id).toBe(publishedEntry.id);
  });

  // A transcript is not a post in its own right. If its article is not
  // published, neither is it — otherwise a draft leaks in full.
  it("drops a transcript whose entry is still a draft", () => {
    const draft = { ...publishedEntry, data: { ...publishedEntry.data, draft: true } };
    expect(pairTranscriptsWithEntries([transcript], [draft])).toEqual([]);
  });

  it("drops a transcript naming an entry that does not exist", () => {
    const orphan = { ...transcript, data: { ...transcript.data, entry: "no-such-entry" } };
    expect(pairTranscriptsWithEntries([orphan], [publishedEntry])).toEqual([]);
  });

  it("sorts newest recording first", () => {
    const older = {
      ...transcript,
      id: "older",
      data: {
        ...transcript.data,
        entry: "older-entry",
        recordedDate: new Date("2024-01-01T00:00:00Z"),
      },
    };
    const olderEntry = { ...publishedEntry, id: "older-entry" };
    const pairs = pairTranscriptsWithEntries([older, transcript], [publishedEntry, olderEntry]);
    expect(pairs.map((p) => p.transcript.id)).toEqual([transcript.id, "older"]);
  });
});

describe("transcriptMarkdown", () => {
  const md = transcriptMarkdown(transcript, publishedEntry);

  it("opens with the title, marked as a transcript", () => {
    expect(md.split("\n")[0]).toBe("# A Practical Workflow for AI Coding Assistants — transcript");
  });

  it("names the event and when it was recorded", () => {
    expect(md).toContain("Stanford Converge 2025");
    expect(md).toContain("2025-12-11");
  });

  it("gives the runtime in words", () => {
    expect(md).toContain("48 minutes");
  });

  it("links the recording, so a reader can check any line against the source", () => {
    expect(md).toContain("https://www.youtube.com/watch?v=cvs_OGmYidY");
  });

  it("carries the canonical URL of the transcript itself", () => {
    expect(md).toContain(
      "https://jgreen.one/entries/practical-workflow-for-ai-coding-assistants/transcript",
    );
  });

  it("links back to the article it belongs to", () => {
    expect(md).toContain("https://jgreen.one/entries/practical-workflow-for-ai-coding-assistants");
  });

  it("states how the transcript was edited, so it is not read as verbatim", () => {
    expect(md).toContain("Lightly edited for readability.");
  });

  it("passes the body through untouched", () => {
    expect(md).toContain(transcript.body.trim());
  });

  it("omits optional metadata that is absent", () => {
    const bare = {
      ...transcript,
      data: {
        ...transcript.data,
        slidesUrl: undefined,
        repoUrl: undefined,
        editedNote: undefined,
        eventUrl: undefined,
      },
    };
    const out = transcriptMarkdown(bare, publishedEntry);
    expect(out).not.toContain("Slides:");
    expect(out).not.toContain("undefined");
  });
});
