import { defineCollection, z } from "astro:content";

/**
 * entries: single feed for both projects & blog posts.
 * The "kind" field lets you separate later without moving files.
 */
const entries = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string().describe("Short, human-readable title"),
    description: z.string().max(160).describe("1–2 sentence summary for cards & SEO"),
    pubDate: z.coerce.date().describe("Publish date (YYYY-MM-DD)"),
    updatedDate: z.coerce.date().optional().describe("Last updated date, optional"),
    kind: z.enum(["project", "blog"]).default("blog"),
    tags: z.array(z.string()).default([]).describe("Keywords like 'ai', 'ml', 'astro'"),
    heroImage: z.string().optional().describe("Path in /public or external image URL"),
    draft: z.boolean().default(false)
  }),
});

export const collections = { entries };
