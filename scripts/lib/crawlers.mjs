/**
 * The crawler roster and the rules for judging what one received.
 *
 * The roster is DERIVED, not hand-written. Which agents exist comes from
 * ai-robots-txt/ai.robots.txt, a community-maintained dataset with dozens of
 * contributors that tracks new agents as they appear; which agents this site
 * cares about comes from our own robots.txt. A hand-written list here was
 * already wrong within an hour of being written, missing two agents the site
 * grants by name, which is exactly the rot that deriving it avoids.
 *
 * Simulating a crawler means sending its User-Agent and Accept headers to the
 * live site and reading the response the way it would. That catches the things
 * that actually went wrong here: a 403 where a 404 belonged, a text format
 * with no declared charset, and content negotiation failing to hand back
 * Markdown.
 *
 * What it cannot reproduce is the source IP. A real crawler arrives from a
 * published range, so a site that filters by IP would treat this differently.
 * This one does not filter by IP, which is exactly why the simulation is
 * faithful for it. Verify that assumption before trusting these results
 * elsewhere.
 *
 * Verification ranges, for when that assumption needs rechecking:
 *   Google    https://developers.google.com/static/crawling/ipranges/
 *   OpenAI    https://openai.com/gptbot.json
 *   Anthropic https://claude.com/crawling/bots.json
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import robotsParser from "robots-parser";

const DATASET_PATH = fileURLToPath(new URL("../data/ai-crawlers.json", import.meta.url));
const ROBOTS_PATH = fileURLToPath(new URL("../../public/robots.txt", import.meta.url));

/** The vendored snapshot; refresh with `npm run crawlers:update`. */
/**
 * One crawler profile.
 *
 * `accept` is present only on the profile used to exercise content
 * negotiation, so it is optional; without the typedef the array's type is
 * inferred from the first entry and rejects it.
 *
 * @typedef {{
 *   name: string,
 *   token: string,
 *   userAgent: string,
 *   operator: string,
 *   accept?: string,
 * }} Crawler
 */

export const loadDataset = () => JSON.parse(readFileSync(DATASET_PATH, "utf-8"));

/** The site's own policy, which decides whose access is worth checking. */
export const loadRobotsTxt = () => readFileSync(ROBOTS_PATH, "utf-8");

/**
 * Realistic User-Agent strings for the agents worth impersonating precisely.
 *
 * The dataset names agents by their robots.txt token and does not carry full
 * UA strings, so these are kept here. Anything not listed gets a synthesised
 * string, which is enough: the token is what a server matches on.
 */
const KNOWN_USER_AGENTS = {
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Google-Extended": "Mozilla/5.0 (compatible; Google-Extended/1.0)",
  GoogleOther: "Mozilla/5.0 (compatible; GoogleOther)",
  GPTBot: "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
  "OAI-SearchBot":
    "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
  "ChatGPT-User": "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  ClaudeBot: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Claude-User": "Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "Claude-SearchBot":
    "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
  PerplexityBot:
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Perplexity-User":
    "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  CCBot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
};

const userAgentFor = (token) =>
  KNOWN_USER_AGENTS[token] ?? `Mozilla/5.0 (compatible; ${token})`;

/**
 * The agents robots.txt names explicitly. The wildcard names no one.
 *
 * A user-agent value is the rest of the line, not a single word: the
 * maintained dataset carries twelve tokens containing spaces, such as
 * "Brightbot 1.0" and "ChatGPT Agent". Splitting on whitespace would silently
 * truncate those to a name no crawler answers to.
 */
export function agentsNamedIn(robotsTxt) {
  const found = [];
  for (const [, rest] of robotsTxt.matchAll(/^[ \t]*user-agent:[ \t]*([^\r\n]*)/gim)) {
    const token = rest.replace(/#.*$/, "").trim();
    if (token && token !== "*" && !found.includes(token)) found.push(token);
  }
  return found;
}

/**
 * A profile for every agent in the dataset, for a full sweep.
 *
 * Tokens that differ only by case are the same agent listed twice upstream, so
 * they are collapsed: testing both wastes requests and duplicate names break
 * lookup.
 */
export function rosterFromDataset(dataset) {
  const seen = new Set();
  /** @type {Crawler[]} */
  const roster = [];

  for (const token of Object.keys(dataset)) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roster.push({
      name: token,
      token,
      userAgent: userAgentFor(token),
      operator: dataset[token].operator ?? "",
    });
  }

  return roster;
}

/**
 * Agents this site names that the maintained dataset does not recognise.
 *
 * A misspelled token grants nothing at all: the group matches no crawler and
 * fails silently. Checking our names against the dataset is the only way to
 * catch that.
 */
export function unknownAgents(robotsTxt, dataset) {
  const known = new Set(Object.keys(dataset).map((name) => name.toLowerCase()));
  return agentsNamedIn(robotsTxt).filter((token) => !known.has(token.toLowerCase()));
}

/**
 * Build the crawler profiles to test: everyone robots.txt names, plus any
 * `extra` tokens, plus one profile that asks for Markdown so content
 * negotiation is exercised.
 */
/**
 * @param {string} robotsTxt
 * @param {Record<string, any>} dataset
 * @param {{ extra?: string[] }} [options]
 * @returns {Crawler[]}
 */
export function buildRoster(robotsTxt, dataset, { extra = [] } = {}) {
  const tokens = [...agentsNamedIn(robotsTxt)];
  for (const token of extra) if (!tokens.includes(token)) tokens.push(token);

  const entry = (token) =>
    dataset[Object.keys(dataset).find((k) => k.toLowerCase() === token.toLowerCase())] ?? {};

  /** @type {Crawler[]} */
  const roster = tokens.map((token) => ({
    name: token,
    token,
    userAgent: userAgentFor(token),
    operator: entry(token).operator ?? "",
  }));

  // One profile asks for the Markdown twin, since that feature only proves
  // itself when something actually negotiates for it.
  const negotiator = roster.find((c) => c.token === "ClaudeBot") ?? roster[0];
  if (negotiator) {
    roster.push({ ...negotiator, name: `${negotiator.token} (markdown)`, accept: "text/markdown" });
  }

  return roster;
}

/** The roster for this repository, built from the real policy and dataset. */
export const defaultRoster = () =>
  buildRoster(loadRobotsTxt(), loadDataset(), { extra: ["Googlebot"] });

export const crawlerByName = (name, roster = defaultRoster()) =>
  roster.find((c) => c.name === name);

/**
 * Types with no in-band way to declare their encoding, which therefore need
 * the charset in the header to be decoded correctly.
 *
 * HTML, XML and JSON are deliberately absent: HTML carries <meta charset>, XML
 * carries its own declaration, and JSON is UTF-8 by RFC 8259. Demanding a
 * header from those would report a problem the format has already solved.
 */
const NEEDS_CHARSET = /^text\/(plain|markdown|vtt|csv)$/;

/** Paths with a Markdown twin: the edge function rewrites these and no others. */
const HAS_MARKDOWN_TWIN = /^\/entries\/[^/]+/;

/**
 * Judge one response as the given crawler would experience it.
 *
 * Returns a list of human-readable findings; an empty list means nothing is
 * wrong. Findings rather than a boolean, because one response can be wrong in
 * more than one way at once.
 */
export function evaluateResponse(crawler, url, { status, contentType, expectMissing = false }) {
  const findings = [];

  if (expectMissing) {
    // A private S3 bucket answers a missing key with 403 rather than 404,
    // and a crawler reads 403 as "you are not allowed" instead of "it is
    // gone". Checking a URL that should not exist is the only way to catch
    // that, so the roster deliberately includes one.
    if (status === 403) {
      findings.push("403 — access denied where a 404 belongs; reads as a block");
    } else if (status === 200) {
      findings.push("200 — this page should not exist");
    } else if (status !== 404) {
      findings.push(`unexpected status ${status} for a missing page`);
    }
    return findings;
  }

  if (status === 403) {
    // The distinction matters: 403 tells a crawler it is not allowed, so it
    // concludes the site blocks it. 404 tells it the page is simply gone.
    findings.push(`403 — access denied; a missing page should answer 404`);
  } else if (status === 404) {
    findings.push(`404 — page not found`);
  } else if (status !== 200) {
    findings.push(`unexpected status ${status}`);
  }

  if (status === 200) {
    if (!contentType) {
      findings.push("no content-type header");
    } else {
      const type = contentType.split(";")[0].trim();

      if (NEEDS_CHARSET.test(type) && !/charset=/i.test(contentType)) {
        findings.push(
          `${type} without a charset — UTF-8 will be decoded as windows-1252`,
        );
      }

      if (
        crawler.accept === "text/markdown" &&
        HAS_MARKDOWN_TWIN.test(url) &&
        type !== "text/markdown"
      ) {
        findings.push(
          `asked for text/markdown and received ${type} — negotiation did not fire`,
        );
      }
    }
  }

  return findings;
}

/**
 * Check the body of the files an agent comes specifically to read.
 *
 * A 200 with an empty body satisfies every header check, so the payload has to
 * be looked at directly. Only paths with a known shape are judged; anything
 * else returns no findings rather than guessing.
 */
export function evaluateBody(path, text) {
  const findings = [];
  const body = (text ?? "").trim();

  if (path === "/llms.txt") {
    if (!body) return ["llms.txt is empty"];
    if (/^\s*<(!doctype|html)/i.test(body)) {
      return ["llms.txt returned HTML — the route is not serving the index"];
    }
    if (!/^#\s+\S/m.test(body)) findings.push("llms.txt has no markdown heading");
    // Without links it describes the site rather than indexing it, and an
    // agent has nothing to follow.
    if (!/\]\(\S+\)/.test(body)) findings.push("llms.txt links to nothing");
  }

  if (path === "/robots.txt") {
    if (!body) return ["robots.txt is empty"];
    if (!/^sitemap:\s*\S+/im.test(body)) findings.push("robots.txt names no sitemap");
  }

  return findings;
}

/** Whether robots.txt permits `token` to fetch `url`. */
export function allowedByRobots(robotsTxt, token, url) {
  if (!robotsTxt.trim()) return true;
  const robots = robotsParser(new URL("/robots.txt", url).toString(), robotsTxt);
  return robots.isAllowed(url, token) !== false;
}

/** Roll up a run of results for the closing summary. */
export function summarize(results) {
  const failing = results.filter((r) => r.findings.length > 0);
  return {
    total: results.length,
    passed: results.length - failing.length,
    failed: failing.length,
    affectedCrawlers: [...new Set(failing.map((r) => r.crawler))],
  };
}
