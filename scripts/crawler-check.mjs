#!/usr/bin/env node
/**
 * Fetch the site as each AI crawler and report what it actually received.
 *
 * The slow loop this replaces is asking an assistant to visit the site and
 * reading a summary that may be answering from a cached index rather than a
 * live fetch. This sends each crawler's real User-Agent to the real origin and
 * prints the status, content type and any problem, in a couple of seconds.
 *
 *   node scripts/crawler-check.mjs                       # live site
 *   node scripts/crawler-check.mjs --base http://localhost:4321
 *   node scripts/crawler-check.mjs --crawler GPTBot      # just one
 *   node scripts/crawler-check.mjs --verbose             # every row, not just problems
 *
 * Exits non-zero if any crawler hit a problem, so it can gate a deploy.
 *
 * Caveat worth keeping in mind: this reproduces headers, not source IP. A real
 * crawler arrives from a published range. That matters only for a site that
 * filters by IP; see scripts/lib/crawlers.mjs for the verification lists.
 */
import {
  defaultRoster,
  rosterFromDataset,
  unknownAgents,
  loadRobotsTxt,
  loadDataset,
  evaluateResponse,
  evaluateBody,
  allowedByRobots,
  summarize,
} from "./lib/crawlers.mjs";

const args = process.argv.slice(2);
const optionOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const BASE = (optionOf("--base", "https://jgreen.one") ?? "").replace(/\/+$/, "");
const ONLY = optionOf("--crawler", null);
const VERBOSE = args.includes("--verbose");
const ALL_AGENTS = args.includes("--all");

/**
 * The WAF blocks at 1000 requests per five minutes from one IP. A full sweep
 * of every known agent against the whole path list would exceed that and
 * report failures caused by the test itself, so the sweep uses a core subset
 * and the total is checked before anything is sent.
 */
const RATE_LIMIT = 1000;

/**
 * The routes worth checking: the entry points an agent actually reaches for,
 * plus one that must NOT exist. A private S3 bucket answers a missing key with
 * 403, which a crawler reads as a block, so the absent case needs a check of
 * its own.
 */
const FULL_PATHS = [
  { path: "/" },
  { path: "/robots.txt" },
  { path: "/llms.txt" },
  { path: "/sitemap-index.xml" },
  { path: "/blog/" },
  { path: "/projects/" },
  { path: "/about/" },
  { path: "/entries/this-site/" },
  { path: "/entries/this-site/index.md" },
  { path: "/this-page-does-not-exist", expectMissing: true },
];

/** One of each kind: a page, the index an agent comes for, a twin, an absence. */
const CORE_PATHS = [
  { path: "/" },
  { path: "/llms.txt" },
  { path: "/entries/this-site/index.md" },
  { path: "/this-page-does-not-exist", expectMissing: true },
];

const PATHS = ALL_AGENTS ? CORE_PATHS : FULL_PATHS;

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function fetchAs(crawler, url) {
  const headers = { "User-Agent": crawler.userAgent };
  if (crawler.accept) headers.Accept = crawler.accept;

  try {
    const response = await fetch(url, { headers, redirect: "follow" });
    // The index files are fetched in full: an empty 200 satisfies every header
    // check while giving an agent nothing to read.
    const wantsBody = url.endsWith("/llms.txt") || url.endsWith("/robots.txt");
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body: wantsBody ? await response.text() : undefined,
    };
  } catch (error) {
    return { status: 0, contentType: "", error: String(error.message ?? error) };
  }
}

const ALL = ALL_AGENTS ? rosterFromDataset(loadDataset()) : defaultRoster();
const roster = ONLY ? ALL.filter((c) => c.name === ONLY) : ALL;
if (roster.length === 0) {
  console.error(`No crawler named ${ONLY}. Known: ${ALL.map((c) => c.name).join(", ")}`);
  process.exit(2);
}

// A token our robots.txt names that no known crawler answers to grants nothing
// and fails silently, so it is reported before anything else.
const unknown = unknownAgents(loadRobotsTxt(), loadDataset());
if (unknown.length) {
  console.log(
    `${RED}robots.txt names ${unknown.length} agent(s) no known crawler uses: ${unknown.join(", ")}${RESET}\n`,
  );
}

const planned = roster.length * PATHS.length;
if (planned > RATE_LIMIT) {
  console.error(
    `${RED}${planned} requests would exceed the ${RATE_LIMIT}/5min rate limit and ` +
      `report failures caused by the test itself. Narrow with --crawler.${RESET}`,
  );
  process.exit(2);
}

const source = ALL_AGENTS ? "every known agent" : "derived from robots.txt";
console.log(
  `Checking ${BASE} as ${roster.length} crawler(s), ${source} — ${planned} requests\n`,
);

// robots.txt is fetched once and applied to every agent, which is how a real
// crawler treats it: read the policy, then decide what it is allowed to ask for.
let robotsTxt = "";
try {
  const response = await fetch(`${BASE}/robots.txt`, {
    headers: { "User-Agent": roster[0].userAgent },
  });
  robotsTxt = response.ok ? await response.text() : "";
} catch {
  console.log(`${RED}could not fetch robots.txt${RESET}\n`);
}

const results = [];

for (const crawler of roster) {
  const rows = [];

  for (const { path, expectMissing } of PATHS) {
    const url = `${BASE}${path}`;
    const allowed = allowedByRobots(robotsTxt, crawler.token, url);
    const response = await fetchAs(crawler, url);

    const findings = response.error
      ? [`fetch failed: ${response.error}`]
      : evaluateResponse(crawler, path, { ...response, expectMissing });
    if (!response.error && response.status === 200 && response.body !== undefined) {
      findings.push(...evaluateBody(path, response.body));
    }
    if (!allowed) findings.push("robots.txt disallows this agent");

    results.push({ crawler: crawler.name, url: path, findings });
    rows.push({ path, response, findings, expectMissing });
  }

  const broken = rows.filter((r) => r.findings.length > 0);
  const mark = broken.length === 0 ? `${GREEN}ok${RESET}` : `${RED}${broken.length} problem(s)${RESET}`;
  const who = crawler.operator ? ` ${DIM}(${crawler.operator.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")})${RESET}` : "";
  if (!ALL_AGENTS || broken.length > 0 || VERBOSE) {
    console.log(`${crawler.name.padEnd(30)} ${mark}${who}`);
  }

  for (const row of rows) {
    if (!VERBOSE && row.findings.length === 0) continue;
    const colour = row.findings.length === 0 ? DIM : RED;
    const type = row.response.contentType || "-";
    const label = row.expectMissing ? `${row.path} (must 404)` : row.path;
    console.log(
      `  ${colour}${String(row.response.status).padEnd(4)}${RESET} ${label.padEnd(36)} ${DIM}${type}${RESET}`,
    );
    for (const finding of row.findings) console.log(`       ${RED}${finding}${RESET}`);
  }
}

const summary = summarize(results);
console.log(
  `\n${summary.passed}/${summary.total} checks passed` +
    (summary.failed ? `, ${RED}${summary.failed} failed${RESET}` : ""),
);
if (summary.affectedCrawlers.length) {
  console.log(`Affected: ${summary.affectedCrawlers.join(", ")}`);
}

process.exit(summary.failed > 0 ? 1 : 0);
