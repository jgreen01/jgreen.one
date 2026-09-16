import { z } from "astro/zod";

/**
 * Frontmatter contract for the `pages` collection.
 *
 * Standing prose — the about page and anything like it — lives here rather
 * than inside a `.astro` file so that the rendered HTML and the Markdown twin
 * come from one source. Written as HTML in a component, the prose could only
 * have a twin by being copied, and a copy drifts.
 *
 * A plain module importing `astro/zod` rather than `astro:content`, so it can
 * be unit-tested outside the build.
 */
export const pageSchema = z.object({
  title: z.string().describe("Rendered as the page's h1"),
  description: z.string().max(200).describe("Summary for SEO and the twin's blockquote"),
});

export type PageFrontmatter = z.infer<typeof pageSchema>;
