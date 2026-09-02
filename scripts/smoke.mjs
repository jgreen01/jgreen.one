#!/usr/bin/env node
/**
 * The manual smoke pass, made repeatable.
 *
 * AGENTS.md asks for a look at the real site after any meaningful change. Doing
 * that by hand means remembering which pages matter, remembering to check dark
 * mode, and remembering to shrink the window — so in practice it gets done
 * partially, differently each time. This walks the same set every time, in both
 * themes and both viewports, captures a screenshot of each, and fails loudly on
 * a bad status code or a console error.
 *
 * It does not replace `npm run test:e2e`, which asserts behaviour. It produces
 * something for a human to look at, and catches the class of breakage that only
 * shows up when a real browser renders a real page.
 *
 * Start a server first — `npm run dev`, or `npm run build && npm run preview`
 * to smoke the production output.
 *
 * Usage:
 *   npm run smoke
 *   npm run smoke -- --base http://localhost:4322
 *   npm run smoke -- --routes /,/about,/entries/some-post/
 *   npm run smoke -- --out /tmp/smoke
 */
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  smokeTargets,
  screenshotName,
  isIgnorableConsoleMessage,
  isExpectedStatus,
  summarise,
  DEFAULT_ROUTES,
  DEFAULT_VIEWPORTS,
  DEFAULT_THEMES,
  DEFAULT_IGNORED,
} from "./lib/smoke.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const base = (flag("base", "http://localhost:4321") ?? "").replace(/\/+$/, "");
const outDir = resolve(flag("out", "smoke-screenshots"));
const routes = flag("routes")
  ? String(flag("routes"))
      .split(",")
      .map((route) => route.trim())
      .filter(Boolean)
  : DEFAULT_ROUTES;

const green = (text) => `[32m${text}[0m`;
const red = (text) => `[31m${text}[0m`;
const dim = (text) => `[2m${text}[0m`;

// Fail early and usefully rather than after launching a browser.
try {
  const probe = await fetch(base, { signal: AbortSignal.timeout(5000) });
  if (!probe.ok && probe.status !== 404) throw new Error(`HTTP ${probe.status}`);
} catch (error) {
  console.error(
    `smoke: cannot reach ${base} (${error.message}).\n` +
      `       Start one first:  npm run dev\n` +
      `       Or the built output:  npm run build && npm run preview`,
  );
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const targets = smokeTargets({
  routes,
  viewports: DEFAULT_VIEWPORTS,
  themes: DEFAULT_THEMES,
});

console.log(
  `smoke: ${routes.length} routes × ${DEFAULT_VIEWPORTS.length} viewports × ` +
    `${DEFAULT_THEMES.length} themes = ${targets.length} checks against ${base}\n`,
);

const browser = await chromium.launch();
const results = [];

for (const { route, viewport, theme } of targets) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
  });

  // Everything about the document's own fetch is judged once, by
  // isExpectedStatus. Both listeners below therefore ignore it and watch only
  // sub-resources — otherwise /404, the one page whose correct answer is a 4xx,
  // reports itself broken twice over.
  const documentUrl = `${base}${route}`;
  const errors = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Chromium logs a failed document fetch here too, and its text says nothing
    // about which URL failed — location() is the only thing that identifies it.
    if (message.location()?.url === documentUrl) return;
    const text = message.text();
    if (!isIgnorableConsoleMessage(text, DEFAULT_IGNORED)) errors.push(text);
  });

  page.on("pageerror", (error) => errors.push(String(error)));

  page.on("response", (response) => {
    if (response.url() === documentUrl) return;
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });

  let status = 0;
  try {
    const response = await page.goto(documentUrl, { waitUntil: "networkidle" });
    status = response?.status() ?? 0;
  } catch (error) {
    errors.push(`navigation failed: ${error.message}`);
  }

  const file = screenshotName(route, viewport.name, theme);
  await page.screenshot({ path: join(outDir, file), fullPage: true });
  await page.close();

  const ok = isExpectedStatus(route, status) && errors.length === 0;
  results.push({ route, viewport: viewport.name, theme, status, errors, ok });

  const label = `${route} ${dim(`${viewport.name}/${theme}`)}`;
  console.log(ok ? `  ${green("✓")} ${label}` : `  ${red("✗")} ${label}  ${errors[0] ?? status}`);
}

await browser.close();

const summary = summarise(results);
console.log(`\nsmoke: ${summary.passed}/${summary.total} clean. Screenshots in ${outDir}`);

if (summary.failed > 0) {
  console.error(`\nsmoke: ${summary.failed} failed\n`);
  for (const failure of summary.failures) {
    console.error(`  ${failure.route} (${failure.viewport}/${failure.theme})`);
    for (const error of failure.errors.slice(0, 5)) console.error(`      ${error}`);
  }
  process.exit(1);
}
