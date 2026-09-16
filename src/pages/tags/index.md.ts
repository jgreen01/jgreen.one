import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { aggregateTags, filterDrafts } from "../../utils/entries";
import { tagsIndexMarkdown } from "../../utils/pageMarkdown";

export const prerender = true;

/** The Markdown twin of the tag index, from the same aggregation as the HTML. */
export const GET: APIRoute = async () => {
  const tags = aggregateTags(filterDrafts(await getCollection("entries")));

  return new Response(
    tagsIndexMarkdown({
      path: "/tags/",
      // aggregateTags returns [tag, count] tuples, already sorted.
      tags: tags.map(([tag, count]) => ({ tag, count })),
    }),
    {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    },
  );
};
