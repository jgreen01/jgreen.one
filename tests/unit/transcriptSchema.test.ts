import { describe, it, expect } from "vitest";
import { transcriptSchema } from "../../src/content/transcriptSchema";
import {
  validTranscriptFrontmatter,
  minimalTranscriptFrontmatter,
  overlongDescription,
  maxLengthDescription,
} from "../fixtures/transcript";

describe("transcriptSchema", () => {
  describe("valid input", () => {
    it("parses fully-populated frontmatter without error", () => {
      const result = transcriptSchema.parse(validTranscriptFrontmatter);
      expect(result.title).toBe(validTranscriptFrontmatter.title);
      expect(result.videoId).toBe("cvs_OGmYidY");
      expect(result.durationSeconds).toBe(2928);
      expect(result.slidesUrl).toBe("/media/practical-workflow-for-ai-coding-assistants.pdf");
    });

    it("coerces recordedDate into a Date", () => {
      const result = transcriptSchema.parse(validTranscriptFrontmatter);
      expect(result.recordedDate).toBeInstanceOf(Date);
      expect(result.recordedDate.getUTCFullYear()).toBe(2025);
    });

    it("accepts minimal frontmatter, leaving optionals undefined", () => {
      const result = transcriptSchema.parse(minimalTranscriptFrontmatter);
      expect(result.eventUrl).toBeUndefined();
      expect(result.slidesUrl).toBeUndefined();
      expect(result.repoUrl).toBeUndefined();
    });
  });

  describe("required fields", () => {
    it.each([
      "title",
      "description",
      "entry",
      "event",
      "recordingUrl",
      "videoId",
      "recordedDate",
      "durationSeconds",
    ] as const)("throws when %s is missing", (field) => {
      const input: Record<string, unknown> = { ...minimalTranscriptFrontmatter };
      delete input[field];
      expect(() => transcriptSchema.parse(input)).toThrow();
    });
  });

  describe("description length", () => {
    // Same 160-character cap as entries: this feeds the page's meta description,
    // and an overlong one is silently truncated by search engines.
    it("accepts exactly 160 characters", () => {
      expect(() =>
        transcriptSchema.parse({
          ...minimalTranscriptFrontmatter,
          description: maxLengthDescription,
        }),
      ).not.toThrow();
    });

    it("rejects 161 characters", () => {
      expect(() =>
        transcriptSchema.parse({
          ...minimalTranscriptFrontmatter,
          description: overlongDescription,
        }),
      ).toThrow();
    });
  });

  describe("durationSeconds", () => {
    it.each([0, -1, 12.5])("rejects %s", (value) => {
      expect(() =>
        transcriptSchema.parse({ ...minimalTranscriptFrontmatter, durationSeconds: value }),
      ).toThrow();
    });
  });

  describe("mirrorUrl", () => {
    // A self-hosted copy of the recording, so the talk survives the YouTube
    // upload being removed or blocked. Same rule as heroImage: a managed asset
    // path or an external URL, never a bare relative filename that would
    // resolve against whatever page happens to reference it.
    it("accepts a managed asset path", () => {
      const result = transcriptSchema.parse({
        ...minimalTranscriptFrontmatter,
        mirrorUrl: "/media/a-talk.mp4",
      });
      expect(result.mirrorUrl).toBe("/media/a-talk.mp4");
    });

    it("accepts an external https URL", () => {
      expect(() =>
        transcriptSchema.parse({
          ...minimalTranscriptFrontmatter,
          mirrorUrl: "https://example.com/a-talk.mp4",
        }),
      ).not.toThrow();
    });

    it.each(["a-talk.mp4", "media/a-talk.mp4", "./a-talk.mp4"])(
      "rejects the relative path %s",
      (value) => {
        expect(() =>
          transcriptSchema.parse({ ...minimalTranscriptFrontmatter, mirrorUrl: value }),
        ).toThrow();
      },
    );

    it("is optional", () => {
      expect(transcriptSchema.parse(minimalTranscriptFrontmatter).mirrorUrl).toBeUndefined();
    });
  });

  describe("recordingUrl", () => {
    it("rejects a non-URL", () => {
      expect(() =>
        transcriptSchema.parse({ ...minimalTranscriptFrontmatter, recordingUrl: "not-a-url" }),
      ).toThrow();
    });
  });
});
