import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { pairTranscriptsWithEntries } from "../../../utils/transcript";

export const prerender = true;

/**
 * Caption files, inlined at build time.
 *
 * Read through Vite's glob import rather than `node:fs`: an endpoint is bundled
 * before it runs, so `import.meta.url` points at the built module and a path
 * resolved from it misses the source tree entirely. This resolves at build,
 * against the real files, with no dependency on the working directory.
 */
const CAPTIONS = import.meta.glob("../../../content/transcripts/*.vtt", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const captionsFor = (transcriptId: string): string | undefined => {
  const key = Object.keys(CAPTIONS).find((path) => path.endsWith(`/${transcriptId}.vtt`));
  return key ? CAPTIONS[key] : undefined;
};

/**
 * The caption track for a talk, at `/entries/<slug>/captions.vtt`.
 *
 * Served from the same committed `.vtt` that generated the transcript, so the
 * captions on the self-hosted video and the words on the transcript page cannot
 * disagree — there is only one file.
 *
 * A transcript with no caption file produces no route at all, so the player
 * falls back to no captions rather than requesting a 404.
 */
export async function getStaticPaths() {
  const [transcripts, entries] = await Promise.all([
    getCollection("transcripts"),
    getCollection("entries"),
  ]);

  return pairTranscriptsWithEntries(transcripts, entries)
    .filter(({ transcript }) => captionsFor(transcript.id) !== undefined)
    .map(({ transcript, entry }) => ({
      params: { slug: entry.id },
      props: { captions: captionsFor(transcript.id) as string },
    }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(props.captions as string, {
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
