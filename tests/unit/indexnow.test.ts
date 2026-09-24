import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ENDPOINT,
  MAX_URLS_PER_REQUEST,
  sitemapLocs,
  parseSitemap,
  collectSitemap,
  changedUrls,
  validateKey,
  buildPayloads,
  describeResponse,
  submit,
  snapshot,
  toSnapshotJson,
  fromSnapshotJson,
} from "../../scripts/lib/indexnow.mjs";

/**
 * IndexNow tells every participating engine (Bing, Yandex, Amazon and
 * others) which URLs changed, so they recrawl those instead of waiting to find out.
 * The protocol asks for changed URLs only, so most of this is working out
 * what changed from the sitemap, and making sure a failure never takes a
 * deploy down with it.
 *
 * The sitemaps are recorded from a real build (2026-09-23), byte-identical to
 * what was live that day. Nothing here touches the network: `fetch` is passed
 * in, and these tests pass a fake that records the request.
 */
const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf-8");
const INDEX = fixture("indexnow_sitemap-index.xml");
const CHILD = fixture("indexnow_sitemap-0.xml");

const ORIGIN = "https://jgreen.one";
const HOST = "jgreen.one";
const KEY = "0123456789abcdef0123456789abcdef"; // synthetic
const KEY_LOCATION = `${ORIGIN}/indexnow-key.txt`;

const map = (entries: [string, string | null][]) => new Map(entries);

/** A stand-in for fetch: records each call and answers from a table. */
function fakeFetch(answer: (url: string, init?: RequestInit) => { status: number; body?: string } | Error) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = answer(url, init);
    if (reply instanceof Error) throw reply;
    return { status: reply.status, ok: reply.status < 300, text: async () => reply.body ?? "" };
  };
  return { fetch, calls };
}

describe("sitemapLocs", () => {
  it("lists the child sitemaps of the real index", () => {
    expect(sitemapLocs(INDEX)).toEqual([`${ORIGIN}/sitemap-0.xml`]);
  });
});

describe("parseSitemap", () => {
  const urls = parseSitemap(CHILD);

  it("reads every URL in the real build", () => {
    expect(urls.size).toBe(36);
    expect([...urls.values()].filter(Boolean)).toHaveLength(34);
  });

  it("maps each URL to its lastmod, or null where the page has none", () => {
    expect(urls.get(`${ORIGIN}/`)).toBe("2026-09-03T00:00:00.000Z");
    expect(urls.get(`${ORIGIN}/about/`)).toBeNull();
    expect(urls.get(`${ORIGIN}/contact/`)).toBeNull();
  });

  it("decodes XML entities in a URL", () => {
    const xml = "<urlset><url><loc>https://jgreen.one/a?x=1&amp;y=2</loc></url></urlset>";
    expect([...parseSitemap(xml).keys()]).toEqual(["https://jgreen.one/a?x=1&y=2"]);
  });

  it("tolerates a pretty-printed sitemap", () => {
    const xml = `<urlset>\n  <url>\n    <loc>\n      https://jgreen.one/x/\n    </loc>\n    <lastmod>2026-01-01</lastmod>\n  </url>\n</urlset>`;
    expect(parseSitemap(xml)).toEqual(map([["https://jgreen.one/x/", "2026-01-01"]]));
  });

  it("ignores an image sitemap's own loc", () => {
    const xml =
      "<urlset><url><loc>https://jgreen.one/p/</loc>" +
      "<image:image><image:loc>https://jgreen.one/i.png</image:loc></image:image></url></urlset>";
    expect([...parseSitemap(xml).keys()]).toEqual(["https://jgreen.one/p/"]);
  });
});

describe("collectSitemap", () => {
  it("reads every child sitemap the index names", async () => {
    const asked: string[] = [];
    const urls = await collectSitemap(INDEX, async (loc: string) => {
      asked.push(loc);
      return CHILD;
    });
    expect(asked).toEqual([`${ORIGIN}/sitemap-0.xml`]);
    expect(urls.size).toBe(36);
  });

  it("merges several children", async () => {
    const index = `<sitemapindex><sitemap><loc>${ORIGIN}/a.xml</loc></sitemap><sitemap><loc>${ORIGIN}/b.xml</loc></sitemap></sitemapindex>`;
    const children: Record<string, string> = {
      [`${ORIGIN}/a.xml`]: `<urlset><url><loc>${ORIGIN}/1/</loc></url></urlset>`,
      [`${ORIGIN}/b.xml`]: `<urlset><url><loc>${ORIGIN}/2/</loc></url></urlset>`,
    };
    const urls = await collectSitemap(index, async (loc: string) => children[loc]);
    expect([...urls.keys()]).toEqual([`${ORIGIN}/1/`, `${ORIGIN}/2/`]);
  });
});

describe("changedUrls", () => {
  const before = map([
    ["https://jgreen.one/", "2026-09-03"],
    ["https://jgreen.one/about/", null],
    ["https://jgreen.one/old/", "2026-01-01"],
    ["https://jgreen.one/same/", "2026-02-02"],
  ]);

  it("finds nothing when nothing changed", () => {
    expect(changedUrls(before, new Map(before))).toEqual([]);
  });

  it("finds a new URL", () => {
    const after = new Map(before).set("https://jgreen.one/new/", "2026-09-23");
    expect(changedUrls(before, after)).toEqual(["https://jgreen.one/new/"]);
  });

  it("finds a URL whose lastmod changed", () => {
    const after = new Map(before).set("https://jgreen.one/", "2026-09-23");
    expect(changedUrls(before, after)).toEqual(["https://jgreen.one/"]);
  });

  it("finds a URL that disappeared, so engines learn of the 404 sooner", () => {
    const after = new Map(before);
    after.delete("https://jgreen.one/old/");
    expect(changedUrls(before, after)).toEqual(["https://jgreen.one/old/"]);
  });

  it("never finds a page with no lastmod on either side", () => {
    expect(changedUrls(before, new Map(before))).not.toContain("https://jgreen.one/about/");
  });

  it("lists new and changed URLs in build order, then removed ones", () => {
    const after = map([
      ["https://jgreen.one/new/", "2026-09-23"],
      ["https://jgreen.one/", "2026-09-23"],
      ["https://jgreen.one/about/", null],
      ["https://jgreen.one/same/", "2026-02-02"],
    ]);
    expect(changedUrls(before, after)).toEqual([
      "https://jgreen.one/new/",
      "https://jgreen.one/",
      "https://jgreen.one/old/",
    ]);
  });
});

describe("validateKey", () => {
  it.each([KEY, "abcdefgh", "a".repeat(128), "Key-With-Dashes-01"])("accepts %s", (key) => {
    expect(validateKey(key)).toBe(true);
  });

  it.each(["", "abcdefg", "a".repeat(129), "has_underscore", "has space", `${KEY}\n`])(
    "rejects %j",
    (key) => {
      expect(validateKey(key)).toBe(false);
    },
  );
});

describe("buildPayloads", () => {
  const base = { host: HOST, key: KEY, keyLocation: KEY_LOCATION };

  it("builds the payload the protocol specifies", () => {
    expect(buildPayloads({ ...base, urls: [`${ORIGIN}/a/`, `${ORIGIN}/b/`] })).toEqual([
      { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: [`${ORIGIN}/a/`, `${ORIGIN}/b/`] },
    ]);
  });

  it("builds nothing for no URLs", () => {
    expect(buildPayloads({ ...base, urls: [] })).toEqual([]);
  });

  it("refuses a URL on another host, which the endpoint would reject with 422", () => {
    expect(() => buildPayloads({ ...base, urls: ["https://www.jgreen.one/a/"] })).toThrow(/not on jgreen\.one/);
    expect(() => buildPayloads({ ...base, urls: ["not a url"] })).toThrow(/not on jgreen\.one/);
  });

  it("refuses a key location on another host", () => {
    expect(() => buildPayloads({ ...base, keyLocation: "https://example.com/k.txt", urls: [] })).toThrow(
      /key location/,
    );
  });

  it("refuses an invalid key", () => {
    expect(() => buildPayloads({ ...base, key: "short", urls: [] })).toThrow(/key/);
  });

  it("splits at the per-request limit", () => {
    expect(MAX_URLS_PER_REQUEST).toBe(10_000);
    const urls = Array.from({ length: 5 }, (_, i) => `${ORIGIN}/${i}/`);
    const payloads = buildPayloads({ ...base, urls, chunkSize: 2 });
    expect(payloads.map((p: { urlList: string[] }) => p.urlList.length)).toEqual([2, 2, 1]);
  });
});

describe("describeResponse", () => {
  it.each([
    [200, true, /submitted/i],
    [202, true, /validation/i],
    [400, false, /bad request/i],
    [403, false, /key/i],
    [422, false, /host|key/i],
    [429, false, /too many/i],
    [500, false, /unexpected/i],
  ])("%i → ok=%s", (status, ok, message) => {
    const result = describeResponse(status);
    expect(result.ok).toBe(ok);
    expect(result.message).toMatch(message);
  });
});

describe("submit", () => {
  const args = { host: HOST, key: KEY, keyLocation: KEY_LOCATION };

  it("POSTs the payload as JSON to the shared endpoint", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200 }));
    await submit({ ...args, urls: [`${ORIGIN}/a/`], fetch });
    expect(ENDPOINT).toBe("https://api.indexnow.org/indexnow");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({ "Content-Type": "application/json; charset=utf-8" });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: [`${ORIGIN}/a/`],
    });
  });

  it("reports one result per request", async () => {
    const { fetch } = fakeFetch(() => ({ status: 202 }));
    const results = await submit({ ...args, urls: [`${ORIGIN}/a/`, `${ORIGIN}/b/`], fetch });
    expect(results).toEqual([expect.objectContaining({ status: 202, ok: true, count: 2 })]);
  });

  it("reports a rejection rather than throwing", async () => {
    const { fetch } = fakeFetch(() => ({ status: 403 }));
    const [result] = await submit({ ...args, urls: [`${ORIGIN}/a/`], fetch });
    expect(result).toEqual(expect.objectContaining({ status: 403, ok: false }));
  });

  it("reports a network failure rather than throwing", async () => {
    const { fetch } = fakeFetch(() => new Error("getaddrinfo ENOTFOUND"));
    const [result] = await submit({ ...args, urls: [`${ORIGIN}/a/`], fetch });
    expect(result).toEqual(expect.objectContaining({ status: null, ok: false }));
    expect(result.message).toMatch(/ENOTFOUND/);
  });

  it("sends nothing when there is nothing to submit", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200 }));
    expect(await submit({ ...args, urls: [], fetch })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("snapshot", () => {
  it("reads the live index, then each sitemap it names", async () => {
    const { fetch, calls } = fakeFetch((url) => ({
      status: 200,
      body: url.endsWith("sitemap-index.xml") ? INDEX : CHILD,
    }));
    const result = await snapshot({ origin: ORIGIN, fetch });
    expect(calls.map((c) => c.url)).toEqual([`${ORIGIN}/sitemap-index.xml`, `${ORIGIN}/sitemap-0.xml`]);
    expect(result.ok).toBe(true);
    expect(result.urls?.size).toBe(36);
  });

  it("reports an unreachable site rather than throwing", async () => {
    const { fetch } = fakeFetch(() => new Error("ECONNREFUSED"));
    const result = await snapshot({ origin: ORIGIN, fetch });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/ECONNREFUSED/) });
  });

  it("treats a non-200 as a failure, not as an empty sitemap", async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: "<html>Not found</html>" }));
    const result = await snapshot({ origin: ORIGIN, fetch });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/404/) });
  });
});

describe("snapshot files", () => {
  it("round-trip, lastmod nulls included", () => {
    const urls = parseSitemap(CHILD);
    const text = toSnapshotJson(urls, { origin: ORIGIN, takenAt: "2026-09-23T00:00:00.000Z" });
    expect(fromSnapshotJson(text)).toEqual(urls);
    expect(JSON.parse(text)).toEqual(expect.objectContaining({ origin: ORIGIN, takenAt: "2026-09-23T00:00:00.000Z" }));
  });

  it.each(["", "not json", "{}", '{"urls": 3}'])("read %j as no snapshot", (text) => {
    expect(fromSnapshotJson(text)).toBeNull();
  });
});
