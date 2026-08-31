import { expect, type Page } from "@playwright/test";

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
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
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
