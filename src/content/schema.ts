import { z } from "astro/zod";

/**
 * Frontmatter contract for the `entries` collection.
 *
 * Kept in a plain module (importing `astro/zod` rather than the `astro:content`
 * virtual module) so it can be imported and unit-tested outside Astro's build
 * pipeline. `src/content/config.ts` wires it into `defineCollection`.
 */
export const entrySchema = z.object({
  title: z.string().describe("Short, human-readable title"),
  description: z.string().max(160).describe("1–2 sentence summary for cards & SEO"),
  pubDate: z.coerce.date().describe("Publish date (YYYY-MM-DD)"),
  updatedDate: z.coerce.date().optional().describe("Last updated date, optional"),
  kind: z.enum(["project", "blog"]).default("blog"),
  tags: z.array(z.string()).default([]).describe("Keywords like 'ai', 'ml', 'astro'"),
  heroImage: z
    .string()
    .refine((value) => value.startsWith("/media/") || /^https?:\/\//.test(value), {
      message:
        "heroImage must be a managed asset path (/media/...) or an external https URL. " +
        "Add the file to public/media/ and run `npm run media:push`.",
    })
    .optional()
    .describe("Managed asset path (/media/...) or an external https URL"),
  draft: z.boolean().default(false),
});

export type EntryFrontmatter = z.infer<typeof entrySchema>;
