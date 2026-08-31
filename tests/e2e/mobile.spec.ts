import { test, expect } from "@playwright/test";
import { collectPageErrors } from "./helpers";

/**
 * Mobile-viewport behaviour. Runs only under the `mobile` project
 * (iPhone 13, 390×844) — see playwright.config.ts.
 *
 * The hamburger toggle is inline JS at the bottom of Base.astro with no other
 * coverage, so these are the only tests exercising it.
 */

const MENU = "#mobile-menu";
const BUTTON = "#menu-btn";

test.describe("mobile navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the hamburger and hides the desktop nav", async ({ page }) => {
    await expect(page.locator(BUTTON)).toBeVisible();
    await expect(page.locator("nav.site-nav").first()).toBeHidden();
  });

  test("the menu starts closed", async ({ page }) => {
    await expect(page.locator(MENU)).toBeHidden();
  });

  test("tapping the hamburger opens the menu", async ({ page }) => {
    await page.locator(BUTTON).click();
    await expect(page.locator(MENU)).toBeVisible();
  });

  test("tapping again closes the menu", async ({ page }) => {
    await page.locator(BUTTON).click();
    await expect(page.locator(MENU)).toBeVisible();

    await page.locator(BUTTON).click();
    await expect(page.locator(MENU)).toBeHidden();
  });

  test("survives repeated toggling", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.locator(BUTTON).click();
      await expect(page.locator(MENU)).toBeVisible();
      await page.locator(BUTTON).click();
      await expect(page.locator(MENU)).toBeHidden();
    }
  });

  for (const [name, pattern] of [
    ["Home", /\/$/],
    ["Projects", /\/projects\/$/],
    ["Blog", /\/blog\/$/],
    ["About", /\/about\/?$/],
    ["Contact", /\/contact\/?$/],
  ] as const) {
    test(`the '${name}' link in the mobile menu navigates`, async ({ page }) => {
      await page.locator(BUTTON).click();
      await expect(page.locator(MENU)).toBeVisible();

      await page.locator(MENU).getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(pattern);
    });
  }
});

test.describe("mobile layout", () => {
  test("the page does not scroll horizontally", async ({ page }) => {
    await page.goto("/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("the avatar scales down without overflowing", async ({ page }) => {
    await page.goto("/");
    const avatar = page.locator("svg.avatar");
    await expect(avatar).toBeVisible();

    const box = (await avatar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.width).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(viewport.width);
  });

  test("an entry page renders cleanly on a phone", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/entries/how-this-site-was-made/");

    await expect(page.locator("article h1")).toBeVisible();
    expect(errors).toEqual([]);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, "article content overflows the viewport").toBeLessThanOrEqual(
      clientWidth + 1,
    );
  });
});
