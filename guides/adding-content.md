---
owner: @jgreen01
status: published
created: 2026-06-27
last_reviewed: 2026-06-27
summary: How to add a blog post or project to jgreen.one
---

# Adding Content

All content lives in a single Astro collection, `entries` (`src/content/config.ts`).
Blog posts and projects are the **same kind of file** — they differ only by the
`kind` frontmatter field. Routes like `/blog` and `/projects` are filtered views
over this one collection.

## Scope

This covers adding/editing a post or project. It does **not** cover layout or
styling changes.

## Steps

1. Create a Markdown file in `src/content/entries/`, e.g.
   `src/content/entries/my-post.md`. The filename becomes the URL slug
   (`/entries/my-post`, also surfaced under `/blog` or `/projects`).

2. Add frontmatter (schema enforced by `src/content/config.ts`):

   ```yaml
   ---
   title: "My Post Title"          # required
   description: "One–two sentence summary (≤160 chars), used on cards & SEO."  # required
   pubDate: 2026-06-27             # required (YYYY-MM-DD)
   updatedDate: 2026-06-28         # optional
   kind: "blog"                    # "blog" | "project" (default: blog)
   tags: ["astro", "notes"]        # optional
   heroImage: "my-image.png"       # optional — see note below
   draft: false                    # true hides it from builds
   ---
   ```

3. Write the body in Markdown below the frontmatter (GitHub-flavored Markdown +
   MDX are supported).

4. Preview locally:

   ```bash
   npm run dev      # http://localhost:4321
   ```

## Verification

- `npm run check` — passes (schema + types).
- The entry shows on `/blog` or `/projects` (per `kind`) and at its slug.
- A `draft: true` entry should **not** appear in `npm run build` output.

## Notes / gotchas

- **Description max length is 160 chars** — the build fails otherwise.
- **Hero images:** put the file in `public/entries/` and set
  `heroImage: "my-image.png"` (the `EntryCard`/article layout prefixes
  `/entries/`). An absolute path or external URL also works.
- **Drafts** (`draft: true`) are filtered out at build time
  (`getCollection("entries", e => !e.data.draft)`), so they never ship.
- To publish a draft, flip `draft` to `false` and rebuild/deploy.

## Related

- Deploying: `guides/deploying.md`
- Schema source of truth: `src/content/config.ts`
