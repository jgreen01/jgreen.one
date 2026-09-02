import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { llmsTxt, type ListableEntry, type ListableTranscriptPair } from "../utils/llmsTxt";
import { pairTranscriptsWithEntries } from "../utils/transcript";

export const prerender = true;

/**
 * `/llms.txt` — points agents at the Markdown copies of each entry.
 *
 * Deliberately modest expectations: see the note in src/utils/llmsTxt.ts.
 */
export const GET: APIRoute = async () => {
  const [entries, transcripts] = await Promise.all([
    getCollection("entries"),
    getCollection("transcripts"),
  ]);

  // Pairing filters transcripts down to those whose article is published, so a
  // draft cannot be advertised to every agent that reads this file.
  const pairs = pairTranscriptsWithEntries(
    transcripts,
    entries,
  ) as unknown as ListableTranscriptPair[];

  return new Response(llmsTxt(entries as unknown as ListableEntry[], pairs), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
