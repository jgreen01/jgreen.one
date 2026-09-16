import type { APIRoute } from "astro";
import { CONTACT, contactBlock } from "../../utils/contact";
import { SEO_DEFAULTS } from "../../utils/seoMeta";

export const prerender = true;

/**
 * The Markdown twin of the contact page.
 *
 * Generated from `src/utils/contact.ts`, the same object the HTML page renders
 * from, so there is no second copy of the address to fall out of date.
 */
export const GET: APIRoute = () =>
  new Response(
    [
      "# Let's connect",
      "",
      "> Ways to reach me for projects, collaboration, or a quick hello.",
      "",
      `Source: ${SEO_DEFAULTS.site}/contact/`,
      "",
      "---",
      "",
      `- Email: [${CONTACT.email}](mailto:${CONTACT.email})`,
      `- GitHub: [${CONTACT.githubHandle}](${CONTACT.github})`,
      `- LinkedIn: [${CONTACT.linkedinHandle}](${CONTACT.linkedin})`,
      "",
      "I read every message; short and specific is appreciated.",
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
