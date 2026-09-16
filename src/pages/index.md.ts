import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { filterDrafts, sortByDate } from "../utils/entries";
import { listingMarkdown } from "../utils/pageMarkdown";
import { SEO_DEFAULTS } from "../utils/seoMeta";

export const prerender = true;

/**
 * The Markdown twin of this listing.
 *
 * Generated from the same collection query the HTML page runs, so the two
 * cannot describe different sets of entries.
 */
export const GET: APIRoute = async () => {
  const published = sortByDate(filterDrafts(await getCollection("entries")));
  const listed = published.map((entry) => ({
    id: entry.id,
    title: entry.data.title,
    description: entry.data.description,
    kind: entry.data.kind,
    pubDate: entry.data.pubDate,
    tags: entry.data.tags,
  }));

  return new Response(listingMarkdown({
    title: "Jon Green",
    description: SEO_DEFAULTS.description,
    path: "/",
    intro:
      "Senior software developer focused on reliable, scalable systems and clear, human-centered design. Currently expanding into data science (MCS-DS) and applied ML.",
    entries: listed,
  }), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
