import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  agentsNamedIn,
  unknownAgents,
  rosterFromDataset,
  buildRoster,
  crawlerByName,
  evaluateResponse,
  allowedByRobots,
  evaluateBody,
  summarize,
} from "../../scripts/lib/crawlers.mjs";

const ok = { status: 200, contentType: "text/html; charset=utf-8" };

const DATASET = {
  "Google-Extended": { operator: "Google", respect: "Yes" },
  GPTBot: { operator: "OpenAI", respect: "Yes" },
  ClaudeBot: { operator: "Anthropic", respect: "Yes" },
  "Perplexity-User": { operator: "Perplexity", respect: "No" },
  Googlebot: { operator: "Google", respect: "Yes" },
};

const ROBOTS = [
  "User-agent: *",
  "Allow: /",
  "",
  "User-agent: Google-Extended",
  "Allow: /",
  "",
  "User-agent: GPTBot",
  "Allow: /",
  "",
  "User-agent: Perplexity-User",
  "Allow: /",
  "",
  "Sitemap: https://jgreen.one/sitemap-index.xml",
].join("\n");

describe("agentsNamedIn", () => {
  it("lists the agents named explicitly", () => {
    expect(agentsNamedIn(ROBOTS)).toEqual(["Google-Extended", "GPTBot", "Perplexity-User"]);
  });

  it("ignores the wildcard group, which names no one", () => {
    expect(agentsNamedIn("User-agent: *\nAllow: /\n")).toEqual([]);
  });

  it("is case-insensitive about the directive and tolerates extra spacing", () => {
    expect(agentsNamedIn("user-agent:   GPTBot\nAllow: /")).toEqual(["GPTBot"]);
  });

  it("does not repeat an agent named in two groups", () => {
    expect(agentsNamedIn("User-agent: GPTBot\nUser-agent: GPTBot\nAllow: /")).toEqual([
      "GPTBot",
    ]);
  });

  it("finds nothing in an empty file", () => {
    expect(agentsNamedIn("")).toEqual([]);
  });
});

describe("agentsNamedIn, awkward tokens", () => {
  // A robots.txt user-agent value is the rest of the line, not a single word.
  // The maintained dataset carries twelve tokens with spaces in them, so
  // splitting on whitespace silently truncates real agents.
  it.each([
    ["Brightbot 1.0", "User-agent: Brightbot 1.0\nAllow: /"],
    ["ChatGPT Agent", "User-agent: ChatGPT Agent\nAllow: /"],
    ["Sidetrade indexer bot", "User-agent: Sidetrade indexer bot\nAllow: /"],
  ])("keeps %s whole", (token, robotsTxt) => {
    expect(agentsNamedIn(robotsTxt)).toEqual([token]);
  });

  it("strips a trailing comment", () => {
    expect(agentsNamedIn("User-agent: GPTBot  # trains models\nAllow: /")).toEqual(["GPTBot"]);
  });

  it("strips trailing whitespace and carriage returns", () => {
    expect(agentsNamedIn("User-agent: GPTBot   \r\nAllow: /")).toEqual(["GPTBot"]);
  });

  it("ignores a commented-out group", () => {
    expect(agentsNamedIn("# User-agent: GPTBot\nUser-agent: CCBot")).toEqual(["CCBot"]);
  });

  it("ignores a user-agent line with no value", () => {
    expect(agentsNamedIn("User-agent:\nAllow: /")).toEqual([]);
  });
});

describe("rosterFromDataset", () => {
  const dataset = {
    GPTBot: { operator: "OpenAI" },
    "Brightbot 1.0": { operator: "Brightbot" },
    "meta-externalagent": { operator: "Meta" },
    "Meta-ExternalAgent": { operator: "Meta" },
  };

  it("builds a profile for every distinct agent", () => {
    expect(rosterFromDataset(dataset).map((c) => c.token)).toContain("GPTBot");
  });

  // The dataset carries the same agent under two spellings. Testing both is
  // wasted requests, and duplicate names break lookup by name.
  it("collapses tokens that differ only by case", () => {
    const tokens = rosterFromDataset(dataset).map((c) => c.token.toLowerCase());
    expect(tokens.filter((t) => t === "meta-externalagent")).toHaveLength(1);
  });

  it("keeps a token containing a space intact", () => {
    const entry = rosterFromDataset(dataset).find((c) => c.token === "Brightbot 1.0");
    expect(entry).toBeDefined();
    expect(entry!.userAgent).toContain("Brightbot 1.0");
  });

  it("gives every entry a unique name", () => {
    const names = rosterFromDataset(dataset).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers the whole real dataset without collision", () => {
    const real = JSON.parse(
      readFileSync(resolve(__dirname, "../../scripts/data/ai-crawlers.json"), "utf-8"),
    );
    const roster = rosterFromDataset(real);
    expect(roster.length).toBeGreaterThan(150);
    expect(new Set(roster.map((c) => c.name)).size).toBe(roster.length);
    for (const crawler of roster) {
      expect(crawler.userAgent, `${crawler.token} has an empty user agent`).toBeTruthy();
    }
  });
});

describe("unknownAgents", () => {
  // A misspelled token in robots.txt silently grants nothing: the group
  // matches no crawler. Checking our names against the maintained dataset is
  // the only way to notice.
  it("is empty when every named agent is real", () => {
    expect(unknownAgents(ROBOTS, DATASET)).toEqual([]);
  });

  it("reports a name the dataset does not know", () => {
    const typo = ROBOTS.replace("GPTBot", "GPTBoot");
    expect(unknownAgents(typo, DATASET)).toEqual(["GPTBoot"]);
  });

  it("matches the dataset case-insensitively, as robots.txt tokens are", () => {
    expect(unknownAgents("User-agent: gptbot\nAllow: /", DATASET)).toEqual([]);
  });
});

describe("buildRoster", () => {
  const roster = buildRoster(ROBOTS, DATASET);

  // Deriving the roster from robots.txt is the point: the checker then tests
  // exactly what the site claims to allow, and cannot drift from it.
  it("covers every agent the site names", () => {
    for (const token of ["Google-Extended", "GPTBot", "Perplexity-User"]) {
      expect(roster.map((c) => c.token)).toContain(token);
    }
  });

  it("gives every entry a user agent containing its token", () => {
    for (const crawler of roster) {
      expect(crawler.userAgent).toContain(crawler.token);
    }
  });

  it("includes the extra agents asked for, even when robots.txt does not name them", () => {
    expect(buildRoster(ROBOTS, DATASET, { extra: ["Googlebot"] }).map((c) => c.token)).toContain(
      "Googlebot",
    );
  });

  it("does not duplicate an extra that robots.txt already names", () => {
    const tokens = buildRoster(ROBOTS, DATASET, { extra: ["GPTBot"] }).map((c) => c.token);
    expect(tokens.filter((t) => t === "GPTBot")).toHaveLength(1);
  });

  it("adds one profile that negotiates for markdown", () => {
    expect(roster.filter((c) => c.accept === "text/markdown")).toHaveLength(1);
  });

  it("carries the operator through, so a failure says who is affected", () => {
    expect(roster.find((c) => c.token === "GPTBot")?.operator).toContain("OpenAI");
  });

  it("has no duplicate names", () => {
    const names = roster.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the real robots.txt and the real dataset", () => {
  const robotsTxt = readFileSync(resolve(__dirname, "../../public/robots.txt"), "utf-8");
  const dataset = JSON.parse(
    readFileSync(resolve(__dirname, "../../scripts/data/ai-crawlers.json"), "utf-8"),
  );

  it("ships a dataset with a plausible number of agents", () => {
    expect(Object.keys(dataset).length).toBeGreaterThan(50);
  });

  // This is the regression guard for the bug in the first version of this
  // tool: a hand-written roster that had already drifted from robots.txt.
  it("names only agents the maintained dataset recognises", () => {
    expect(unknownAgents(robotsTxt, dataset)).toEqual([]);
  });

  it("builds a roster covering every agent the site names", () => {
    const roster = buildRoster(robotsTxt, dataset);
    for (const agent of agentsNamedIn(robotsTxt)) {
      expect(roster.map((c) => c.token)).toContain(agent);
    }
  });
});

describe("evaluateResponse", () => {
  const gptbot = crawlerByName("GPTBot")!;

  it("reports nothing when the page is served correctly", () => {
    expect(evaluateResponse(gptbot, "/", ok)).toEqual([]);
  });

  // 403 is the signal that made assistants report the site as blocking them,
  // so it is called out separately from an ordinary failure.
  it("flags a 403 as an access denial, not merely an error", () => {
    const findings = evaluateResponse(gptbot, "/", { ...ok, status: 403 });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/403/);
    expect(findings[0].toLowerCase()).toMatch(/denied|forbidden|blocked/);
  });

  it("flags a page that should exist but does not", () => {
    const findings = evaluateResponse(gptbot, "/", { ...ok, status: 404 });
    expect(findings.join(" ")).toMatch(/404/);
  });

  it("flags a server error", () => {
    expect(evaluateResponse(gptbot, "/", { ...ok, status: 503 })).not.toEqual([]);
  });

  // A format with no in-band way to declare its encoding is decoded with a
  // legacy default, which turns UTF-8 punctuation into mojibake.
  it.each(["text/plain", "text/markdown", "text/vtt"])(
    "flags %s when it does not declare its charset",
    (contentType) => {
      const findings = evaluateResponse(gptbot, "/llms.txt", { status: 200, contentType });
      expect(findings.join(" ")).toMatch(/charset/i);
    },
  );

  it("accepts a text response that declares utf-8", () => {
    expect(
      evaluateResponse(gptbot, "/llms.txt", {
        status: 200,
        contentType: "text/plain; charset=utf-8",
      }),
    ).toEqual([]);
  });

  // These carry their encoding inside the document: HTML in <meta charset>,
  // XML in its declaration, and JSON is UTF-8 by RFC 8259. Demanding a header
  // as well would report a problem the format has already solved.
  it.each(["text/html", "application/xml", "text/xml", "application/json"])(
    "does not demand a charset header from %s",
    (contentType) => {
      expect(evaluateResponse(gptbot, "/", { status: 200, contentType })).toEqual([]);
    },
  );

  it("does not demand a charset from a binary response", () => {
    expect(
      evaluateResponse(gptbot, "/media/hero.webp", { status: 200, contentType: "image/webp" }),
    ).toEqual([]);
  });

  it("flags a missing content type", () => {
    expect(evaluateResponse(gptbot, "/", { status: 200, contentType: "" })).not.toEqual([]);
  });

  describe("content negotiation", () => {
    const agent = { ...gptbot, accept: "text/markdown" };

    it("flags HTML returned to an agent that asked for markdown", () => {
      const findings = evaluateResponse(agent, "/entries/a/", ok);
      expect(findings.join(" ")).toMatch(/markdown/i);
    });

    it("accepts markdown returned to an agent that asked for it", () => {
      expect(
        evaluateResponse(agent, "/entries/a/", {
          status: 200,
          contentType: "text/markdown; charset=utf-8",
        }),
      ).toEqual([]);
    });

    it("does not expect markdown for an agent that never asked", () => {
      expect(evaluateResponse(gptbot, "/entries/a/", ok)).toEqual([]);
    });

    // Only entry pages have a Markdown twin. The edge function rewrites paths
    // under /entries/ and nothing else, so expecting Markdown from the
    // homepage or robots.txt would report a failure that is correct behaviour.
    it.each([
      ["/", "text/html; charset=utf-8"],
      ["/robots.txt", "text/plain; charset=utf-8"],
      ["/blog/", "text/html; charset=utf-8"],
      ["/sitemap-index.xml", "application/xml"],
    ])("does not expect a markdown twin for %s", (path, contentType) => {
      expect(evaluateResponse(agent, path, { status: 200, contentType })).toEqual([]);
    });

    it("still expects the twin for an already-explicit .md path", () => {
      const findings = evaluateResponse(agent, "/entries/a/index.md", ok);
      expect(findings.join(" ")).toMatch(/markdown/i);
    });
  });
});

describe("a URL that is supposed to be missing", () => {
  const gptbot = crawlerByName("GPTBot")!;
  const missing = { expectMissing: true };

  // The whole point: a private S3 bucket answers a missing key with 403, and
  // a crawler reads that as "you are not allowed" rather than "it is gone".
  it("flags a 403 where a 404 belongs", () => {
    const findings = evaluateResponse(gptbot, "/no-such-page", {
      status: 403,
      contentType: "application/xml",
      ...missing,
    });
    expect(findings.join(" ")).toMatch(/403/);
    expect(findings.join(" ").toLowerCase()).toMatch(/denied|forbidden|blocked/);
  });

  it("accepts a 404", () => {
    expect(
      evaluateResponse(gptbot, "/no-such-page", {
        status: 404,
        contentType: "text/html; charset=utf-8",
        ...missing,
      }),
    ).toEqual([]);
  });

  // A 200 here means a missing page is being served as real content, which
  // would put junk URLs into the index.
  it("flags a 200, because the page should not exist", () => {
    const findings = evaluateResponse(gptbot, "/no-such-page", {
      status: 200,
      contentType: "text/html; charset=utf-8",
      ...missing,
    });
    expect(findings.join(" ")).toMatch(/200|should not exist/i);
  });
});

describe("evaluateBody", () => {
  const llms = [
    "# Jon Green — Software Developer",
    "",
    "> Personal site.",
    "",
    "## Entries",
    "",
    "- [The Site as a Workbench](https://jgreen.one/entries/this-site/index.md): a project",
  ].join("\n");

  // A 200 with an empty body passes every header check, so the thing an agent
  // actually came for has to be looked at directly.
  it("passes a well-formed llms.txt", () => {
    expect(evaluateBody("/llms.txt", llms)).toEqual([]);
  });

  it("flags an empty llms.txt", () => {
    expect(evaluateBody("/llms.txt", "").join(" ")).toMatch(/empty/i);
  });

  it("flags an llms.txt that is only whitespace", () => {
    expect(evaluateBody("/llms.txt", "   \n\n  ").join(" ")).toMatch(/empty/i);
  });

  it("flags an llms.txt with no heading", () => {
    expect(evaluateBody("/llms.txt", "just some prose\n").join(" ")).toMatch(/heading/i);
  });

  // Without links it is a description of the site rather than an index into
  // it, and an agent has nothing to follow.
  it("flags an llms.txt that links to nothing", () => {
    expect(evaluateBody("/llms.txt", "# Title\n\n> Summary\n").join(" ")).toMatch(/link/i);
  });

  it("flags an llms.txt that was served the HTML page by mistake", () => {
    expect(evaluateBody("/llms.txt", "<!doctype html><html>").join(" ")).toMatch(/html/i);
  });

  it("flags a robots.txt with no sitemap", () => {
    expect(evaluateBody("/robots.txt", "User-agent: *\nAllow: /\n").join(" ")).toMatch(
      /sitemap/i,
    );
  });

  it("passes a robots.txt that points at the sitemap", () => {
    expect(
      evaluateBody(
        "/robots.txt",
        "User-agent: *\nAllow: /\n\nSitemap: https://jgreen.one/sitemap-index.xml\n",
      ),
    ).toEqual([]);
  });

  it("has no opinion about a path it does not know", () => {
    expect(evaluateBody("/about/", "")).toEqual([]);
  });
});

describe("allowedByRobots", () => {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: BadBot",
    "Disallow: /",
    "",
    "Sitemap: https://jgreen.one/sitemap-index.xml",
  ].join("\n");

  it("allows an agent named with Allow", () => {
    expect(allowedByRobots(robots, "GPTBot", "https://jgreen.one/")).toBe(true);
  });

  it("allows an unnamed agent through the wildcard", () => {
    expect(allowedByRobots(robots, "SomeOtherBot", "https://jgreen.one/")).toBe(true);
  });

  it("reports an agent that is disallowed", () => {
    expect(allowedByRobots(robots, "BadBot", "https://jgreen.one/")).toBe(false);
  });

  it("treats an empty robots.txt as allowing everything", () => {
    expect(allowedByRobots("", "GPTBot", "https://jgreen.one/")).toBe(true);
  });
});

describe("summarize", () => {
  it("counts checks and failures", () => {
    const summary = summarize([
      { crawler: "GPTBot", url: "/", findings: [] },
      { crawler: "GPTBot", url: "/a", findings: ["403 denied"] },
      { crawler: "ClaudeBot", url: "/", findings: [] },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(2);
  });

  it("lists which crawlers had problems, without repeating one twice", () => {
    const summary = summarize([
      { crawler: "GPTBot", url: "/", findings: ["a"] },
      { crawler: "GPTBot", url: "/b", findings: ["b"] },
    ]);
    expect(summary.affectedCrawlers).toEqual(["GPTBot"]);
  });

  it("is clean for an empty run", () => {
    expect(summarize([])).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      affectedCrawlers: [],
    });
  });
});
