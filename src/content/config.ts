import { defineCollection } from "astro:content";
import { entrySchema } from "./schema";

/**
 * entries: single feed for both projects & blog posts.
 * The "kind" field lets you separate later without moving files.
 *
 * The schema itself lives in `./schema.ts` so it can be unit-tested without
 * Astro's build pipeline.
 */
const entries = defineCollection({
  type: "content",
  schema: entrySchema,
});

export const collections = { entries };
