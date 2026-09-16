import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;

/**
 * Where the suite points.
 *
 * Defaults to a locally built preview. Set `E2E_BASE_URL` to run the same
 * assertions against a deployed site — the point of which is that a local
 * build cannot catch what only the CDN does: status codes, redirects,
 * response headers and the edge function.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/** A remote target is already serving; building and starting one would be wrong. */
const isRemote = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseURL);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // A stray `test.only` must never silently shrink the CI suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Not `webServer`: Astro 7's `astro preview` daemonizes and returns straight
  // away, which Playwright treats as the server having "exited early". Global
  // setup builds the site, starts the daemon and waits for it to answer;
  // teardown stops it. See tests/e2e/global-setup.ts.
  ...(isRemote
    ? {}
    : {
        globalSetup: "./tests/e2e/global-setup.ts",
        globalTeardown: "./tests/e2e/global-teardown.ts",
      }),

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    // WebKit needs system libraries that `npx playwright install` alone does not
    // provide (`npx playwright install-deps webkit`, which needs sudo). Where
    // they are missing its network process dies and *every* HTTP navigation
    // fails with "WebKit encountered an internal error" — so it is opt-in rather
    // than a permanently red project. CI sets E2E_WEBKIT=1 after installing deps.
    ...(process.env.E2E_WEBKIT
      ? [
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
            testIgnore: /mobile\.spec\.ts/,
          },
        ]
      : []),
    {
      // iPhone 13 viewport, user agent and touch support, but driven by Chromium
      // so mobile coverage does not inherit the WebKit limitation above. These
      // tests target layout and the inline hamburger script, not engine quirks.
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
