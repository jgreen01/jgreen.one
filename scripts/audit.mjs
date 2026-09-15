#!/usr/bin/env node
/**
 * Audit the site with Lighthouse, Google's own engine.
 *
 *   node scripts/audit.mjs                          # live site
 *   node scripts/audit.mjs --base http://localhost:4321
 *   node scripts/audit.mjs --page /blog/            # one page
 *   node scripts/audit.mjs --verbose                # per-audit detail
 *
 * Why this rather than more hand-written checks: Lighthouse already encodes
 * the edge cases, and its SEO reasoning is Google's. It catches the exact bug
 * this site shipped — a page naming the homepage as its canonical scores 0 on
 * the `canonical` audit, with the explanation spelled out.
 *
 * Lighthouse is run through npx rather than added as a dependency: it is a
 * large install used occasionally, and pinning the major keeps it predictable.
 * Chrome comes from the Playwright browser already installed for the e2e
 * suite, so nothing extra is downloaded.
 *
 * Exits non-zero when any page has a finding, so it can gate a deploy.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { evaluateLighthouse, summarizeAudit, CRITICAL_AUDITS } from "./lib/audit.mjs";

const args = process.argv.slice(2);
const optionOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const BASE = (optionOf("--base", "https://jgreen.one") ?? "").replace(/\/+$/, "");
const ONE = optionOf("--page", null);
const VERBOSE = args.includes("--verbose");

/**
 * Serve ./dist here for the duration of the run.
 *
 * The deploy gate audits what was just built rather than what is live: the
 * defects Lighthouse catches are in the HTML, so auditing the live site after
 * a deploy would only confirm the bad version had already shipped.
 */
const PREVIEW = args.includes("--preview");

/** One of each template, since a defect is usually per-layout, not per-page. */
const PAGES = ONE ? [ONE] : ["/", "/blog/", "/projects/", "/about/", "/entries/this-site/"];

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** Chrome from the Playwright install, so no second browser is downloaded. */
function chromePath() {
  try {
    return createRequire(import.meta.url)("playwright").chromium.executablePath();
  } catch {
    return "";
  }
}

/**
 * Run Lighthouse against one URL.
 *
 * Deliberately async rather than `spawnSync`: with `--preview` the static
 * server runs in THIS process, and spawnSync blocks the event loop for the
 * whole run. The server could then never answer Lighthouse, which waited for a
 * response that could not come while it was itself being waited on — a
 * deadlock that hung indefinitely.
 */
function runLighthouse(url, outDir) {
  const out = join(outDir, "lhr.json");

  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "-y",
        "lighthouse@13",
        url,
        "--only-categories=seo,best-practices",
        "--output=json",
        `--output-path=${out}`,
        "--quiet",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
      ],
      {
        env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH || chromePath() },
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", () => {});

    const timer = setTimeout(() => child.kill("SIGKILL"), 240_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        resolve({ lhr: JSON.parse(readFileSync(out, "utf-8")) });
      } catch {
        const detail = stderr.trim().split("\n").slice(-3).join(" ");
        resolve({ error: detail || `lighthouse exited ${code}` });
      }
    });
  });
}

/**
 * Serve ./dist in this process for the duration of the run.
 *
 * An earlier version shelled out to `astro preview`. npx spawns astro as a
 * grandchild, so signalling the child left the server listening on the port
 * after the run finished — and a leaked server makes the next deploy audit
 * stale content or fail to bind. An in-process server has no such tree: when
 * this process ends, so does it.
 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveDist(port) {
  const root = new URL("../dist/", import.meta.url);

  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    // Resolve through the URL API so "../" cannot escape dist/.
    let file = new URL(`.${path}`, root);

    if (path.endsWith("/")) file = new URL("index.html", file);
    else if (existsSync(file) && statSync(file).isDirectory()) {
      file = new URL(`${path}/index.html`, root);
    }

    if (!file.pathname.startsWith(new URL(root).pathname) || !existsSync(file)) {
      const notFound = new URL("404.html", root);
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      if (existsSync(notFound)) return createReadStream(notFound).pipe(response);
      return response.end("Not found");
    }

    const extension = file.pathname.slice(file.pathname.lastIndexOf("."));
    response.writeHead(200, { "content-type": MIME[extension] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

let server;
if (PREVIEW) {
  const port = Number(new URL(BASE).port || 4322);
  try {
    server = await serveDist(port);
    console.log(`Serving ./dist on port ${port}\n`);
  } catch (error) {
    console.error(`${RED}could not serve ./dist on ${port}: ${error.message}${RESET}`);
    process.exit(2);
  }
}

console.log(`Auditing ${BASE} with Lighthouse — ${PAGES.length} page(s)\n`);

const results = [];
const workdir = mkdtempSync(join(tmpdir(), "lh-audit-"));

try {
  for (const page of PAGES) {
    const { lhr, error } = await runLighthouse(`${BASE}${page}`, workdir);
    const findings = error ? [`lighthouse failed: ${error}`] : evaluateLighthouse(lhr);
    results.push({ url: page, findings });

    const mark = findings.length === 0 ? `${GREEN}ok${RESET}` : `${RED}${findings.length} problem(s)${RESET}`;
    const scores = lhr
      ? Object.entries(lhr.categories ?? {})
          .map(([name, c]) => `${name} ${Math.round((c.score ?? 0) * 100)}`)
          .join("  ")
      : "";
    console.log(`${page.padEnd(26)} ${mark}  ${DIM}${scores}${RESET}`);

    for (const finding of findings) console.log(`    ${RED}${finding}${RESET}`);

    if (VERBOSE && lhr) {
      for (const id of CRITICAL_AUDITS) {
        const audit = (lhr.audits ?? {})[id];
        if (!audit) continue;
        const score = audit.score === null ? "n/a" : audit.score;
        console.log(`    ${DIM}${id.padEnd(20)} ${score}${RESET}`);
      }
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
  if (server) server.close();
}

const summary = summarizeAudit(results);
console.log(
  `\n${summary.passed}/${summary.total} pages clean` +
    (summary.failed ? `, ${RED}${summary.failed} with problems${RESET}` : ""),
);
if (summary.affectedUrls.length) console.log(`Affected: ${summary.affectedUrls.join(", ")}`);

process.exit(summary.failed > 0 ? 1 : 0);
