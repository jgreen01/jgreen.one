import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { filterDrafts } from "../../../utils/entries";
import { entryMarkdown } from "../../../utils/entryMarkdown";

export const prerender = true;

/**
 * A Markdown copy of each entry, served alongside the HTML at
 * `/entries/<slug>/index.md`.
 *
 * Same content, lighter format — roughly 83% fewer tokens than the rendered
 * page. Deliberately a separate URL rather than a different response at the same
 * one: nothing here inspects the User-Agent, so a search engine and a person
 * always see identical HTML.
 */
export async function getStaticPaths() {
  const published = filterDrafts(await getCollection("entries"));
  return published.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) => {
  const entry = props.entry as CollectionEntry<"entries"> & { body: string };

  return new Response(entryMarkdown(entry), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
