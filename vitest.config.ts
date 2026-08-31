import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fast unit tests only. Build integration (tests/integration) and Playwright
    // E2E (tests/e2e) are opt-in via their own npm scripts — see package.json.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // src/content/config.ts is excluded on purpose: it imports the
      // `astro:content` virtual module and cannot load outside a build.
      include: ["src/utils/**/*.ts", "src/content/schema.ts"],
      // Note: the `text` reporter omits rows for files at 100% on every metric,
      // so a short table means good news. The `html` and `json` reports list
      // every file — use those to confirm a module is actually instrumented.
      reporter: ["text", "html", "json-summary"],
    },
  },
});
