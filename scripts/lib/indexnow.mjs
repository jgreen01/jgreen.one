/**
 * IndexNow: tell participating search engines which URLs changed.
 *
 * One POST to the global endpoint reaches every participating engine: Bing,
 * Yandex and Amazon among them. Membership changes, so the current list is
 * https://www.indexnow.org/searchengines.json. Google does not take part. The protocol asks for changed URLs only, so the
 * work here is mostly deciding what changed: the live sitemap is snapshotted
 * before a deploy replaces it, then diffed against the new build's sitemap.
 * `lastmod` carries the signal. A new post changes its own URL (new) and the
 * listing and tag pages that include it (their lastmod is the newest entry's).
 *
 * Nothing here may fail a deploy: by the time it runs, the site has shipped.
 * Network and HTTP failures come back as results, never as exceptions. Only
 * invalid input, a bad key or a URL on another host, throws, because that is a
 * bug to fix, not a condition to ride out.
 *
 * `fetch` is always a parameter, so tests can pass a fake and nothing reaches
 * the network. Spec: https://www.indexnow.org/documentation
 */

export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const MAX_URLS_PER_REQUEST = 10_000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The trimmed, decoded text of the first <tag> in a fragment, or null. */
function textOf(tag, fragment) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(fragment);
  return match ? decodeXml(match[1].trim()) : null;
}

/** The child sitemaps a sitemap index names. */
export function sitemapLocs(indexXml) {
  return [...indexXml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/g)]
    .map((m) => textOf("loc", m[1]))
    .filter(Boolean);
}

/**
 * Every URL in one sitemap, mapped to its lastmod (null where there is none).
 * `<image:loc>` and friends are not matched: only a bare `<loc>` names a page.
 */
export function parseSitemap(xml) {
  const urls = new Map();
  for (const m of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
    const loc = textOf("loc", m[1]);
    if (loc) urls.set(loc, textOf("lastmod", m[1]));
  }
  return urls;
}

/** Every URL across every child of an index. `loadChild(loc)` returns XML. */
export async function collectSitemap(indexXml, loadChild) {
  const urls = new Map();
  for (const loc of sitemapLocs(indexXml)) {
    for (const [url, lastmod] of parseSitemap(await loadChild(loc))) urls.set(url, lastmod);
  }
  return urls;
}

/**
 * URLs to tell the engines about: new in the build, lastmod changed, or gone.
 * A page with no lastmod on either side never appears, the same trade-off the
 * sitemap itself makes. New and changed URLs come in build order, then the
 * removed ones.
 */
export function changedUrls(before, after) {
  const changed = [];
  for (const [url, lastmod] of after) {
    if (!before.has(url) || before.get(url) !== lastmod) changed.push(url);
  }
  for (const url of before.keys()) if (!after.has(url)) changed.push(url);
  return changed;
}

/** 8–128 characters of a-z, A-Z, 0-9 and "-", per the spec. */
export function validateKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9-]{8,128}$/.test(key);
}

function isOnHost(url, host) {
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
}

/** The request bodies for a submission, split at the per-request limit. */
export function buildPayloads({ host, key, keyLocation, urls, chunkSize = MAX_URLS_PER_REQUEST }) {
  if (!validateKey(key)) throw new Error("invalid IndexNow key: need 8–128 characters of a-z, A-Z, 0-9 and -");
  if (!isOnHost(keyLocation, host)) throw new Error(`key location is not on ${host}`);
  const foreign = urls.filter((url) => !isOnHost(url, host));
  if (foreign.length > 0) throw new Error(`${foreign.length} URL(s) not on ${host}; the endpoint would reject them`);

  const payloads = [];
  for (let i = 0; i < urls.length; i += chunkSize) {
    payloads.push({ host, key, keyLocation, urlList: urls.slice(i, i + chunkSize) });
  }
  return payloads;
}

const RESPONSES = {
  200: [true, "URLs submitted"],
  202: [true, "accepted; key validation pending (normal for a new key)"],
  400: [false, "bad request: invalid format"],
  403: [false, "forbidden: key not valid (key file missing, or it does not hold this key)"],
  422: [false, "unprocessable: a URL is not on the host, or the key does not match the schema"],
  429: [false, "too many requests: treated as potential spam"],
};

/** What an endpoint status means, per the spec's response table. */
export function describeResponse(status) {
  const [ok, message] = RESPONSES[status] ?? [false, `unexpected status ${status}`];
  return { ok, message };
}

/** POSTs the URLs. Returns one result per request and never throws on failure. */
export async function submit({
  urls,
  host,
  key,
  keyLocation,
  fetch,
  endpoint = ENDPOINT,
  chunkSize = MAX_URLS_PER_REQUEST,
}) {
  const results = [];
  for (const payload of buildPayloads({ host, key, keyLocation, urls, chunkSize })) {
    const count = payload.urlList.length;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
      });
      results.push({ count, status: response.status, ...describeResponse(response.status) });
    } catch (error) {
      results.push({ count, status: null, ok: false, message: `request failed: ${error.message}` });
    }
  }
  return results;
}

/**
 * The live sitemap, read before a deploy overwrites it. A failure comes back
 * as `{ ok: false, reason }`; a 404 is a failure, not an empty sitemap, or
 * every URL would look new and be submitted again.
 */
export async function snapshot({ origin, fetch }) {
  const get = async (url) => {
    const response = await fetch(url);
    if (response.status !== 200) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  };
  try {
    const urls = await collectSitemap(await get(`${origin}/sitemap-index.xml`), get);
    return { ok: true, urls };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export function toSnapshotJson(urls, { origin, takenAt }) {
  return JSON.stringify({ origin, takenAt, urls: Object.fromEntries(urls) }, null, 2);
}

/** The URL map from a snapshot file, or null if it is missing or malformed. */
export function fromSnapshotJson(text) {
  try {
    const { urls } = JSON.parse(text);
    if (!urls || typeof urls !== "object" || Array.isArray(urls)) return null;
    return new Map(Object.entries(urls));
  } catch {
    return null;
  }
}
