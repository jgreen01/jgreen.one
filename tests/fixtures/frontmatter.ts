/**
 * Frontmatter fixtures for entry-schema tests.
 *
 * These mirror the real shape of `src/content/entries/*.md` frontmatter but are
 * standalone objects — tests must never read live content from
 * `src/content/entries/`, which changes as posts are added.
 */

/** Every field populated, including the optional ones. */
export const validFullFrontmatter = {
  title: "How This Site Was Built: A Look Under the Hood",
  description:
    "A technical deep-dive into the infrastructure, tools, and AI-assisted workflow used to create this website.",
  pubDate: "2025-09-21",
  updatedDate: "2026-01-15",
  kind: "blog",
  tags: ["astro", "terraform", "aws"],
  heroImage: "images/how-this-website-was-built.png",
  draft: false,
};

/** Only the required fields — everything else should fall back to a default. */
export const minimalFrontmatter = {
  title: "Minimal Entry",
  description: "Just the required fields, nothing more.",
  pubDate: "2025-08-14",
};

/** 161 characters — one over the schema's `description` limit of 160. */
export const overlongDescription = "x".repeat(161);

/** Exactly 160 characters — the boundary that must still pass. */
export const maxLengthDescription = "x".repeat(160);
