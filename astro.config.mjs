// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from "@tailwindcss/vite";

import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import remarkGfm from 'remark-gfm'; // Added remark-gfm

import favicons from "astro-favicons";

// https://astro.build/config
export default defineConfig({
  site: "https://jgreen.one",

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap(), mdx(), favicons()],
  markdown: {
    remarkPlugins: [remarkGfm],
  },
});