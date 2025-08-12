# Project Overview

This directory contains the source code for the jgreen.one website. It is a static website built with [Astro](https://astro.build/) and [Tailwind CSS](https://tailwindcss.com/).

## Key Files

*   `astro.config.mjs`: Astro configuration file.
*   `package.json`: Project dependencies and scripts.
*   `public/`: Static assets.
    *   `robots.txt`: SEO configuration for web crawlers.
*   `src/`: Source code.
    *   `content/`: Content collections for blog posts and projects.
    *   `layouts/`: Astro layouts.
    *   `pages/`: Astro pages.
    *   `styles/`: Global styles.

## Getting Started

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Run the development server:**

    ```bash
    npm run dev
    ```

3.  **Build for production:**

    ```bash
    npm run build
    ```

## Content Management

This project uses [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/) to manage blog posts and projects.

*   Content is stored in `src/content/posts/` as Markdown files.
*   The schema for the content is defined in `src/content/config.ts`.
*   Each post has a `category` field which can be either `blog` or `project`.

To add a new post, create a new Markdown file in `src/content/posts/` and fill in the frontmatter according to the schema.

## SEO

*   A `sitemap-index.xml` is automatically generated at build time.
*   The `public/robots.txt` file is configured to allow all user agents and points to the sitemap.

## Note-Taking

To ensure project continuity, we maintain a practice of taking notes during each development session. This helps us to quickly get back up to speed after a break or an unexpected interruption.

*   **Location:** Notes are stored in the `.notes/` directory.
*   **Format:** Each note file is a Markdown file named with the date of the session (e.g., `YYYY-MM-DD.md`).
*   **Content:** The notes should include a summary of the work done, any decisions made, and any questions or issues that arose.
*   **Git:** The `.notes/` directory is included in the `.gitignore` file, so notes are not committed to the repository.