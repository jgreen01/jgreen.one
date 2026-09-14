/**
 * Reveal arithmetic for the progressively-revealed entry list.
 *
 * The homepage renders every entry into the HTML and hides the tail, rather
 * than fetching pages of new ones. On a static site that keeps the whole list
 * in the document for crawlers and for the Markdown twin, and leaves a reader
 * without JavaScript seeing all of it.
 *
 * These helpers live here because `.astro` files cannot be unit-tested; the
 * component stays a thin wrapper over them.
 */

/** Entries shown before the reader scrolls. */
export const INITIAL_VISIBLE = 5;

/** Entries added each time the sentinel comes into view. */
export const BATCH_SIZE = 5;

/**
 * The visible count after one more reveal, clamped to the list length.
 *
 * `batchSize` is floored at 1: a zero or negative batch would leave the
 * sentinel in view revealing nothing, firing the observer forever.
 */
export function revealMore(visible: number, total: number, batchSize = BATCH_SIZE): number {
  return Math.min(total, visible + Math.max(1, batchSize));
}

/** True once nothing is left to reveal, so the observer can be disconnected. */
export function isComplete(visible: number, total: number): boolean {
  return visible >= total;
}

/** How many entries are still hidden. Never negative. */
export function remaining(visible: number, total: number): number {
  return Math.max(0, total - visible);
}
