import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { filterByKind, filterDrafts, sortByDate } from "../../utils/entries";
import { listingMarkdown } from "../../utils/pageMarkdown";

export const prerender = true;

/**
 * The Markdown twin of this listing.
 *
 * Generated from the same collection query the HTML page runs, so the two
 * cannot describe different sets of entries.
 */
export const GET: APIRoute = async () => {
  const published = sortByDate(filterByKind(filterDrafts(await getCollection("entries")), "project"));
  const listed = published.map((entry) => ({
    id: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    kind: entry.data.kind,
    pubDate: entry.data.pubDate,
    tags: entry.data.tags,
  }));

  return new Response(listingMarkdown({
    title: "Projects",
    description: "Things I have built, and what they were for.",
    path: "/projects/",
    entries: listed,
  }), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
