/**
 * Meta descriptions for the pages that have no writing of their own.
 *
 * Tag and listing pages had none, so all 27 of them fell back to the site-wide
 * default. Google usually rewrites descriptions and rarely treats them as a
 * ranking signal, so this is not about the text itself — it is that 22 thin tag
 * pages describing themselves identically reads as 22 near-duplicates, which is
 * the signal that keeps a page in "Discovered — currently not indexed".
 *
 * Lives here rather than in component frontmatter because `.astro` files cannot
 * be unit-tested, and a description is invisible on the page: a mistake in one
 * survives every visual check.
 */

/** "1 entry" / "4 entries" — the count is what makes a tag page's text its own. */
function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * A tag page.
 *
 * Kept short deliberately: Google truncates around 155 characters, and the
 * distinguishing part — the tag itself — has to survive that cut.
 */
export function tagDescription(tag: string, entries: number): string {
  return `${count(entries, "entry", "entries")} tagged “${tag}” on jgreen.one — writing and projects by Jon Green.`;
}

export type Listing = "blog" | "projects" | "entries" | "tags";

/**
 * A listing page. Each reads differently on purpose; identical wording across
 * four pages is the problem this exists to fix.
 */
export function listingDescription(listing: Listing, total: number): string {
  switch (listing) {
    case "blog":
      return `${count(total, "post", "posts")} by Jon Green on AI, infrastructure-as-code and building things that last.`;
    case "projects":
      return `${count(total, "project", "projects")} by Jon Green — what each one does, how it was built, and what it cost.`;
    case "entries":
      return `Everything on jgreen.one: ${count(total, "post and project", "posts and projects")}, newest first.`;
    case "tags":
      return `Browse jgreen.one by subject — ${count(total, "tag", "tags")} across the writing and the projects.`;
  }
}
