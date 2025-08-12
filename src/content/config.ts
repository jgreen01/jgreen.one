// src/content/config.ts
import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
    category: z.enum(["blog", "project"]),
  }),
});

export const collections = { posts };