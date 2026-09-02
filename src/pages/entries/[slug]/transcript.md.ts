import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  pairTranscriptsWithEntries,
  transcriptMarkdown,
  type TranscriptLike,
  type PairableEntry,
} from "../../../utils/transcript";

export const prerender = true;

/**
 * A Markdown copy of each transcript, at `/entries/<slug>/transcript.md`.
 *
 * The same bargain as `index.md.ts`: identical content, far fewer tokens, and a
 * separate URL rather than a different response at the same one — nothing here
 * inspects the User-Agent, so every visitor is served the same HTML.
 *
 * Transcripts are the case where this pays best. Five thousand words of talk
 * wrapped in page markup is a lot to ask an agent to download for the sake of
 * one quotable line.
 */
export async function getStaticPaths() {
  const [transcripts, entries] = await Promise.all([
    getCollection("transcripts"),
    getCollection("entries"),
  ]);

  return pairTranscriptsWithEntries(transcripts, entries).map(({ transcript, entry }) => ({
    params: { slug: entry.id },
    props: { transcript, entry },
  }));
}

export const GET: APIRoute = ({ props }) => {
  const transcript = props.transcript as TranscriptLike;
  const entry = props.entry as PairableEntry;

  return new Response(transcriptMarkdown(transcript, entry), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
