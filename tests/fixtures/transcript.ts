/**
 * Fixtures for the `transcripts` collection schema and helpers.
 *
 * Shaped after the real Converge 2025 transcript so the tests exercise the
 * frontmatter that actually ships, not a convenient simplification.
 */

export const validTranscriptFrontmatter = {
  title: "A Practical Workflow for AI Coding Assistants",
  description: "Full transcript of the Converge 2025 session, with timestamps linked to the recording.",
  entry: "practical-workflow-for-ai-coding-assistants",
  event: "Stanford Converge 2025",
  eventUrl:
    "https://itcommunity.stanford.edu/converge/2025/sessions/practical-workflow-ai-coding-assistants",
  recordingUrl: "https://www.youtube.com/watch?v=cvs_OGmYidY",
  videoId: "cvs_OGmYidY",
  recordedDate: "2025-12-11",
  durationSeconds: 2928,
  slidesUrl: "/media/practical-workflow-for-ai-coding-assistants.pdf",
  repoUrl: "https://code.stanford.edu/jon.b.green/ai-arcade-demo",
  editedNote: "Lightly edited for readability; wording otherwise unchanged.",
};

/** Only the fields without a default or optional marker. */
export const minimalTranscriptFrontmatter = {
  title: "A Talk",
  description: "A short transcript.",
  entry: "some-entry",
  event: "Some Event",
  recordingUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  videoId: "abcdefghijk",
  recordedDate: "2025-12-11",
  durationSeconds: 60,
};

export const overlongDescription = "x".repeat(161);
export const maxLengthDescription = "x".repeat(160);
