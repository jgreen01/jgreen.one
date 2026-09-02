import { z } from "astro/zod";

const isHttpUrl = (value: string) => /^https?:\/\//.test(value);
const httpUrl = (field: string) =>
  z.string().refine(isHttpUrl, { message: `${field} must be an http(s) URL` });

/**
 * Frontmatter contract for the `transcripts` collection.
 *
 * Kept in a plain module (importing `astro/zod` rather than the `astro:content`
 * virtual module) so it can be imported and unit-tested outside Astro's build
 * pipeline, exactly as `schema.ts` is. `src/content.config.ts` wires it into
 * `defineCollection`.
 *
 * A transcript is not a standalone post: `entry` names the entry it belongs to,
 * and the route joins the two so a transcript inherits its entry's draft status.
 * A transcript for an unpublished article must not build.
 */
export const transcriptSchema = z.object({
  title: z.string().describe("Title of the talk being transcribed"),
  description: z.string().max(160).describe("1–2 sentence summary for cards & SEO"),
  entry: z.string().describe("id of the `entries` item this transcribes"),
  event: z.string().describe("Conference or venue name"),
  eventUrl: httpUrl("eventUrl").optional().describe("Session or event page"),
  recordingUrl: httpUrl("recordingUrl").describe("Where the recording can be watched"),
  videoId: z.string().describe("YouTube video id, used to build timestamp deep links"),
  recordedDate: z.coerce.date().describe("Date the talk was given (YYYY-MM-DD)"),
  durationSeconds: z
    .number()
    .int()
    .positive()
    .describe("Runtime in seconds; rendered as a human-readable duration"),
  slidesUrl: z.string().optional().describe("Managed asset path or external URL"),
  mirrorUrl: z
    .string()
    .refine((value) => value.startsWith("/media/") || isHttpUrl(value), {
      message:
        "mirrorUrl must be a managed asset path (/media/...) or an external http(s) URL. " +
        "Add the file to public/media/ and run `npm run media:push`.",
    })
    .optional()
    .describe("Self-hosted copy of the recording, in case the original becomes unavailable"),
  repoUrl: httpUrl("repoUrl").optional().describe("Companion code repository"),
  editedNote: z
    .string()
    .optional()
    .describe("How the transcript was edited, shown to readers verbatim"),
});

export type TranscriptFrontmatter = z.infer<typeof transcriptSchema>;
