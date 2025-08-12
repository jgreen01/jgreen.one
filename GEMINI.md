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

## Creating Useful Guides

We create useful guides to document processes, best practices, and other important information.

*   **Location:** Guides are stored in the `guides/` directory.
*   **File Naming Convention:** `YYYY-MM-DD_descriptive-name.md`
*   **Format:** Guides are Markdown files.
*   **Content:** Guides should be well-structured and easy to understand.

### Template

A template for new guides is available at `guides/TEMPLATE.md`. To create a new guide, copy the template and fill in the sections.

### Security

**Do not commit any secrets or private information to the repository.** This includes, but is not limited to, passwords, API keys, and personal information.

### Validation

Before committing any changes to the `guides/` directory, run the validation script to check for secrets:

```bash
node scripts/validate_guides.mjs
```

This script will check for a list of keywords and exit with a non-zero exit code if it finds any. The script can be extended to include other checks as needed.