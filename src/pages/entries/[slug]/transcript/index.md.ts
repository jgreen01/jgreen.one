import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  pairTranscriptsWithEntries,
  transcriptMarkdown,
  type TranscriptLike,
  type PairableEntry,
} from "../../../../utils/transcript";

export const prerender = true;

/**
 * The transcript twin again, at `/entries/<slug>/transcript/index.md`.
 *
 * The same document is already served at `/entries/<slug>/transcript.md`, which
 * is the URL the page links and `llms.txt` lists. This second path exists so
 * that the rule "any page plus index.md is its Markdown twin" holds without
 * exception — the edge rewrite depends on that being true everywhere, and a
 * single gap would answer 404 for a URL that has perfectly good HTML.
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
