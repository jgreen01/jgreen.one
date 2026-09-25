// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

import favicons from "astro-favicons";

import { parseEntry, lastmodFor } from './src/utils/sitemapLastmod';
import { remarkCitations } from './src/utils/remarkCitations';

/**
 * Entry dates for the sitemap, read straight from the Markdown.
 *
 * The sitemap is serialised here, before the content collections exist, so the
 * frontmatter is parsed from disk rather than fetched with `getCollection`.
 */
const entriesDir = fileURLToPath(new URL('./src/content/entries', import.meta.url));
const entries = readdirSync(entriesDir)
  .filter((file) => file.endsWith('.md') || file.endsWith('.mdx'))
  .map((file) =>
    parseEntry(file.replace(/\.mdx?$/, ''), readFileSync(join(entriesDir, file), 'utf-8')),
  )
  .filter((entry) => entry !== null);

// https://astro.build/config
export default defineConfig({
  site: "https://jgreen.one",

  vite: {
    plugins: [tailwindcss()],
  },

  markdown: {
    // "[1]" in an article links to item 1 of its References list. Inert in any
    // article without one; see src/utils/remarkCitations.ts.
    remarkPlugins: [remarkCitations],
  },

  integrations: [
    sitemap({
      // Without a lastmod a crawler has no signal that anything changed, so a
      // stale page sits in the index until it happens to be revisited. Pages
      // that cannot be honestly dated are left undated rather than stamped
      // with the build time.
      serialize(item) {
        const lastmod = lastmodFor(new URL(item.url).pathname, entries);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    mdx(),
    favicons(),
  ],
});
