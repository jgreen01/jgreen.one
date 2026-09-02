/**
 * Rendering publication dates.
 *
 * Frontmatter carries bare `YYYY-MM-DD`, which the schema coerces to midnight
 * UTC. Formatting that in the machine's local timezone shifts it backwards
 * anywhere west of Greenwich, so an entry dated the 30th renders as the 29th —
 * quietly, on every page, and only visibly wrong to someone who knows the real
 * date. Pinning the formatter to UTC keeps the displayed day equal to the day
 * written in the file.
 *
 * These live here rather than in component frontmatter because `.astro` files
 * cannot be unit-tested, and a date that is wrong by one day is exactly the
 * kind of defect that survives a visual check.
 */

type DateInput = Date | string | number;

/** Parses to a Date, or null when the value cannot represent one. */
function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const SHORT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
};

const LONG: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
};

/**
 * `Jul 30, 2026` — for entry cards and article bylines.
 *
 * Returns an empty string rather than "Invalid Date" for junk input: a missing
 * date should leave a gap, not print an error into the page.
 */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-US", SHORT) : "";
}

/** `30 July 2026` — for the transcript header, where the month is spelled out. */
export function formatLongDate(value: DateInput): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB", LONG) : "";
}

/** `2026-07-30` — the machine-readable form for a `<time datetime>` attribute. */
export function isoDate(value: DateInput): string {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}
