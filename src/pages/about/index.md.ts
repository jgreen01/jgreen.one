import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { contactBlock } from "../../utils/contact";
import { SEO_DEFAULTS } from "../../utils/seoMeta";

export const prerender = true;

/** The Markdown twin of the about page, from the same collection entry. */
export const GET: APIRoute = async () => {
  const about = await getEntry("pages", "about");
  if (!about?.body) throw new Error("src/content/pages/about.md is missing or empty");

  return new Response(
    [
      `# ${about.data.title}`,
      "",
      `> ${about.data.description}`,
      "",
      `Source: ${SEO_DEFAULTS.site}/about/`,
      "",
      "---",
      "",
      about.body.trim(),
      "",
      contactBlock(),
    ].join("\n"),
    {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    },
  );
};
