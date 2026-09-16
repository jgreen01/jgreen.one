import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { filterByTag, filterDrafts, sortByDate, uniqueTags } from "../../../utils/entries";
import { listingMarkdown } from "../../../utils/pageMarkdown";

export const prerender = true;

export async function getStaticPaths() {
  const published = filterDrafts(await getCollection("entries"));
  return uniqueTags(published).map((tag) => ({ params: { tag } }));
}

/** The Markdown twin of a tag page, from the same filter as the HTML. */
export const GET: APIRoute = async ({ params }) => {
  const tag = String(params.tag);
  const published = filterDrafts(await getCollection("entries"));
  const matches = sortByDate(filterByTag(published, tag));

  return new Response(
    listingMarkdown({
      title: `Tagged “${tag}”`,
      description: `Entries tagged ${tag}.`,
      path: `/tags/${tag}/`,
      entries: matches.map((entry) => ({
        id: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        kind: entry.data.kind,
        pubDate: entry.data.pubDate,
        tags: entry.data.tags,
      })),
    }),
    {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    },
  );
};
