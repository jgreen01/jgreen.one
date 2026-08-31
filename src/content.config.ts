import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { entrySchema } from "./content/schema";

/**
 * entries: single feed for both projects & blog posts.
 * The "kind" field lets you separate later without moving files.
 *
 * Astro 6 requires an explicit loader and reads this config from
 * `src/content.config.ts` (the old `src/content/config.ts` path is ignored).
 * The schema itself lives in `./content/schema.ts` so it can be unit-tested
 * without Astro's build pipeline.
 */
const entries = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/entries" }),
  schema: entrySchema,
});

export const collections = { entries };
