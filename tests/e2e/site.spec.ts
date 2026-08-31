import { test, expect } from "@playwright/test";
import {
  CORE_PAGES,
  ENTRY_WITH_HERO,
  ENTRY_WITHOUT_HERO,
  collectPageErrors,
  expectVisibleWithSize,
  gotoClean,
} from "./helpers";

test.describe("home", () => {
  test("renders the hero, avatar and featured entries without errors", async ({ page }) => {
    await gotoClean(page, "/");

    await expect(page).toHaveTitle(/Jon Green/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest Entries" })).toBeVisible();
  });

  test("draws the avatar SVG at a non-zero size", async ({ page }) => {
    await page.goto("/");
    const box = await expectVisibleWithSize(page, "svg.avatar");
    // The component forces this viewBox because the source asset has none;
    // without it the artwork collapses.
    await expect(page.locator("svg.avatar")).toHaveAttribute("viewBox", "0 0 1000 1000");
    expect(box.width).toBeGreaterThan(50);
  });

  test("lists at least one entry card", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("li").filter({ has: page.locator("a[href^='/entries/']") }).first())
      .toBeVisible();
  });

  test("the featured-entry links reach real entry pages", async ({ page }) => {
    await page.goto("/");
    const first = page.locator("a[href^='/entries/']").first();
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator("article h1")).toBeVisible();
  });

  test("'Browse Projects' and 'Read the Blog' resolve", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Browse Projects" }).click();
    await expect(page).toHaveURL(/\/projects\/$/);
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Read the Blog" }).click();
    await expect(page).toHaveURL(/\/blog\/$/);
    await expect(page.getByRole("heading", { name: "Blog", level: 1 })).toBeVisible();
  });
});

test.describe("listing pages", () => {
  // The zero-entry branch of these pages cannot be reached against the real
  // content set. Its logic is covered by the `filterByKind` / `filterDrafts`
  // unit tests in tests/unit/entries.test.ts, which assert the empty result.
  for (const [path, heading] of [
    ["/blog/", "Blog"],
    ["/projects/", "Projects"],
    ["/entries/", "All Entries"],
  ] as const) {
    test(`${path} lists entries and each card links to an entry`, async ({ page }) => {
      await gotoClean(page, path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();

      const links = page.locator("a[href^='/entries/']");
      await expect(links.first()).toBeVisible();

      // EntryCard emits `/entries/<slug>` with no trailing slash, while the nav
      // links use one. Both resolve — Astro's default trailingSlash is 'ignore'
      // and the CloudFront function appends /index.html.
      for (const href of await links.evaluateAll((as) =>
        as.map((a) => a.getAttribute("href")),
      )) {
        expect(href).toMatch(/^\/entries\/[^/]+\/?$/);
      }
    });

    test(`${path} navigates to an entry when a card is clicked`, async ({ page }) => {
      await page.goto(path);
      const first = page.locator("a[href^='/entries/']").first();
      const href = await first.getAttribute("href");
      await first.click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    });
  }

  test("/entries/ is a superset of the blog and project listings", async ({ page }) => {
    const hrefsOn = async (path: string) => {
      await page.goto(path);
      return page.locator("a[href^='/entries/']").evaluateAll((as) =>
        as.map((a) => a.getAttribute("href")!),
      );
    };

    const blog = await hrefsOn("/blog/");
    const projects = await hrefsOn("/projects/");
    const all = await hrefsOn("/entries/");

    expect(blog.length, "no blog entries to compare").toBeGreaterThan(0);
    expect(projects.length, "no project entries to compare").toBeGreaterThan(0);
    for (const href of [...blog, ...projects]) expect(all).toContain(href);
  });
});

test.describe("entry detail", () => {
  test("renders the title, publish date and body", async ({ page }) => {
    await gotoClean(page, ENTRY_WITH_HERO);

    await expect(page.locator("article h1")).toHaveText(
      "How This Site Was Built: A Look Under the Hood",
    );
    await expect(page.getByText(/Published on/)).toBeVisible();

    const bodyText = await page.locator("article").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(200);
  });

  test("shows the hero image at a non-zero size", async ({ page }) => {
    await page.goto(ENTRY_WITH_HERO);
    const box = await expectVisibleWithSize(page, "article img");
    expect(box.width).toBeGreaterThan(100);
  });

  test("requests the hero image from an absolute path that actually resolves", async ({
    page,
  }) => {
    // Regression guard: a page-relative src resolves against /entries/<slug>/
    // and 404s while still "rendering" as a broken image.
    const responses: number[] = [];
    page.on("response", (response) => {
      if (/\.(png|jpe?g|webp|avif|gif)$/i.test(response.url())) responses.push(response.status());
    });

    await page.goto(ENTRY_WITH_HERO);
    const src = await page.locator("article img").first().getAttribute("src");
    expect(src).toMatch(/^\//);

    const naturalWidth = await page
      .locator("article img")
      .first()
      .evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth, "hero image failed to load").toBeGreaterThan(0);
    expect(responses.every((status) => status < 400)).toBe(true);
  });

  test("an entry without a hero image renders no broken <img>", async ({ page }) => {
    await gotoClean(page, ENTRY_WITHOUT_HERO);
    await expect(page.locator("article img")).toHaveCount(0);
  });

  test("a failing hero image hides its container via the inline onerror handler", async ({
    page,
  }) => {
    // Force the card image to fail so the inline onerror on EntryCard runs.
    await page.route("**/*.png", (route) => route.abort());
    await page.goto("/entries/");

    const container = page.locator(".hero-image-container").first();
    await expect(container).toHaveCount(1);
    await expect(container).toBeHidden();
  });
});

test.describe("tags", () => {
  test("the tags index links to tag pages", async ({ page }) => {
    await gotoClean(page, "/tags/");
    const links = page.locator("a[href^='/tags/']");
    await expect(links.first()).toBeVisible();
    expect(await links.count()).toBeGreaterThan(0);
  });

  test("clicking a tag opens that tag's page with matching entries", async ({ page }) => {
    await page.goto("/tags/");
    const first = page.locator("a[href^='/tags/']").first();
    const tag = (await first.textContent())?.trim();
    await first.click();

    await expect(page).toHaveURL(/\/tags\/[^/]+\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Tag: ${tag}`);
    // Tag routes are only generated for tags that have entries, so a tag page
    // always has at least one card. The zero-match branch is covered by the
    // `filterByTag` unit tests.
    await expect(page.locator("a[href^='/entries/']").first()).toBeVisible();
  });
});

test.describe("static pages", () => {
  test("/about renders cleanly", async ({ page }) => {
    await gotoClean(page, "/about");
    await expect(page).toHaveTitle(/About|Jon Green/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("/contact renders cleanly", async ({ page }) => {
    await gotoClean(page, "/contact");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /hello@jgreen\.one/ })).toBeVisible();
  });
});

test.describe("404", () => {
  test("an unknown path serves the custom 404 page", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("404");
    const text = await page.locator("body").innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test("the 404 page still offers navigation back into the site", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");

    await expect(page.locator("nav.site-nav").first()).toBeAttached();
    await page.getByRole("link", { name: "homepage" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("navigation", () => {
  const NAV_LINKS = [
    ["Home", /\/$/],
    ["Projects", /\/projects\/$/],
    ["Blog", /\/blog\/$/],
    ["About", /\/about\/?$/],
    ["Contact", /\/contact\/?$/],
  ] as const;

  test("every desktop nav link points at a page that loads", async ({ page }) => {
    await page.goto("/");
    const hrefs = await page
      .locator("nav.site-nav")
      .first()
      .locator("a")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));

    expect(hrefs.length).toBe(NAV_LINKS.length);

    for (const href of hrefs) {
      const response = await page.goto(href);
      // 304 is a legitimate cached response from the preview server.
      expect(response?.status(), `${href} returned ${response?.status()}`).toBeLessThan(400);
    }
  });

  test("clicking each desktop nav link navigates to the right page", async ({ page }) => {
    for (const [name, pattern] of NAV_LINKS) {
      await page.goto("/");
      await page.locator("nav.site-nav").first().getByRole("link", { name, exact: true }).click();
      await page.waitForURL(pattern);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("the footer shows the current copyright year", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText(String(new Date().getFullYear()));
  });
});

test.describe("SEO metadata", () => {
  for (const path of [...CORE_PAGES, ENTRY_WITH_HERO]) {
    test(`${path} exposes complete metadata`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveTitle(/.+/);

      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveCount(1);
      expect((await description.getAttribute("content"))?.length).toBeGreaterThan(0);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      expect(await canonical.getAttribute("href")).toMatch(/^https:\/\/jgreen\.one/);

      for (const property of ["og:title", "og:image", "og:url", "og:type"]) {
        const tag = page.locator(`meta[property="${property}"]`);
        await expect(tag, `${property} missing on ${path}`).toHaveCount(1);
        expect((await tag.getAttribute("content"))?.length).toBeGreaterThan(0);
      }

      expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(
        /^https:\/\//,
      );
    });
  }

  test("an article page is typed as an article, not a website", async ({ page }) => {
    await page.goto(ENTRY_WITH_HERO);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  });

  test("a listing page is typed as a website", async ({ page }) => {
    await page.goto("/blog/");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
  });
});

test.describe("colour scheme", () => {
  const bodyBackground = (page: import("@playwright/test").Page) =>
    page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);

  test.describe("light", () => {
    test.use({ colorScheme: "light" });

    test("uses the light background token", async ({ page }) => {
      await page.goto("/");
      expect(await bodyBackground(page)).toBe("rgb(249, 247, 199)"); // #f9f7c7
    });
  });

  test.describe("dark", () => {
    test.use({ colorScheme: "dark" });

    test("uses the dark background token", async ({ page }) => {
      await page.goto("/");
      expect(await bodyBackground(page)).toBe("rgb(31, 36, 41)"); // #1f2429
    });

    test("keeps the same accent colour as light mode", async ({ page }) => {
      // `--accent-color` is deliberately commented out of the dark block in
      // global.scss, so the brand orange carries over unchanged. If that ever
      // becomes a real override, this test is the reminder to update it.
      await page.goto("/");
      const accent = await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).getPropertyValue("--accent-color").trim());
      expect(accent).toBe("#f6780a");
    });

    test("renders the site without errors in dark mode", async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto("/");
      expect(errors).toEqual([]);
    });
  });
});
