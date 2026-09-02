import { expect, type Page } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the managed media assets are present on disk.
 *
 * `public/media/` is git-ignored — its durable copy lives in S3 — so a checkout
 * that has not run `npm run media:pull` has no image bytes. That is CI's
 * situation today, until it can assume an AWS role (task 9). Tests that assert
 * on *pixels* skip when the bytes are absent; tests that assert on *markup*
 * always run, since the HTML is generated either way.
 */
const MEDIA_DIR = fileURLToPath(new URL("../../public/media", import.meta.url));

export const mediaAvailable =
  existsSync(MEDIA_DIR) && readdirSync(MEDIA_DIR).some((f) => /\.(png|jpe?g|webp)$/i.test(f));

/** Every route the site builds a top-level page for. */
export const CORE_PAGES = [
  "/",
  "/blog/",
  "/projects/",
  "/entries/",
  "/tags/",
  "/about",
  "/contact",
] as const;

/** A published entry that carries a hero image, tags and body content. */
export const ENTRY_WITH_HERO = "/entries/how-this-site-was-made/";

/**
 * Whether the build produced a transcript page.
 *
 * Transcripts inherit their article's draft status, so a checkout whose talk
 * write-up is still unpublished has none — and a test asserting on one would
 * fail for a reason that is not a defect. Same reasoning as `mediaAvailable`.
 */
const TRANSCRIPTS_DIR = fileURLToPath(new URL("../../src/content/transcripts", import.meta.url));

export const transcriptPath = (() => {
  const dist = fileURLToPath(new URL("../../dist/entries", import.meta.url));
  if (!existsSync(TRANSCRIPTS_DIR) || !existsSync(dist)) return null;
  const slug = readdirSync(dist, { withFileTypes: true }).find(
    (d) => d.isDirectory() && existsSync(`${dist}/${d.name}/transcript/index.html`),
  );
  return slug ? `/entries/${slug.name}/transcript` : null;
})();

/** A published entry with no hero image, for the "no broken <img>" path. */
export const ENTRY_WITHOUT_HERO = "/entries/sample-blog/";

/**
 * Starts collecting browser-side errors. Call before navigating.
 *
 * Captures both `console.error` output and uncaught exceptions — a page can log
 * an error without throwing, and can throw without logging.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Without the media bytes every hero image 404s, and the browser logs a
    // failed-resource error for each. That is the expected state of a checkout
    // that has not pulled — it says nothing about the page's own scripts, which
    // is what this collector is for. Only ignored when the assets are genuinely
    // absent, so a real /media/ 404 still fails a normal run.
    // The URL is in location(), not text() — Chromium's message is just
    // "Failed to load resource: ... 404 (Not Found)".
    const url = message.location()?.url ?? "";
    if (!mediaAvailable && url.includes("/media/")) return;
    errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Navigates and asserts the page produced no browser-side errors. */
export async function gotoClean(page: Page, path: string) {
  const errors = collectPageErrors(page);
  await page.goto(path);
  expect(errors, `${path} logged browser errors`).toEqual([]);
  return errors;
}

/** Resolves an element's rendered size, asserting it actually occupies space. */
export async function expectVisibleWithSize(page: Page, selector: string) {
  const element = page.locator(selector).first();
  await expect(element).toBeVisible();
  const box = await element.boundingBox();
  expect(box, `${selector} has no bounding box`).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  return box!;
}
