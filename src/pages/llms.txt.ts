import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { llmsTxt, type ListableEntry } from "../utils/llmsTxt";

export const prerender = true;

/**
 * `/llms.txt` — points agents at the Markdown copies of each entry.
 *
 * Deliberately modest expectations: see the note in src/utils/llmsTxt.ts.
 */
export const GET: APIRoute = async () => {
  const entries = (await getCollection("entries")) as unknown as ListableEntry[];

  return new Response(llmsTxt(entries), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
