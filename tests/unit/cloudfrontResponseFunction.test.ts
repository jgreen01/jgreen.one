import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Tests for the CloudFront viewer-response function.
 *
 * Like the viewer-request function, this runs on every response an unhandled
 * exception here is a site-wide fault, so every property access is guarded.
 * The ES5.1 syntax limit applies equally; `aws cloudfront test-function` is
 * what actually proves that, via scripts/test-cloudfront-function.sh.
 *
 * One behaviour is inherited from the platform rather than the code: CloudFront
 * does not run a function when the origin returns 400 or above. The 404 page
 * therefore never reaches this function and cannot be given a twin link.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL("../../infra/live/response-function.js", import.meta.url)),
  "utf-8",
);

function loadHandler() {
  // eslint-disable-next-line no-new-func
  return new Function(`${SOURCE}; return handler;`)() as (event: unknown) => {
    headers: Record<string, { value: string }>;
  };
}

const handler = loadHandler();

const respond = (uri: string, responseHeaders: Record<string, { value: string }> = {}) =>
  handler({
    request: { uri, headers: {} },
    response: { statusCode: 200, headers: responseHeaders },
  });

const linkOf = (uri: string, headers = {}) => respond(uri, headers).headers.link?.value;

describe("the Markdown twin Link header", () => {
  // RFC 8288, and the relation the llms.txt spec recommends. The HTML <link>
  // says the same thing; this reaches a client that never parses the body.
  // The URI this function sees is the one the viewer-request function
  // produced, not the one the viewer typed — verified in production, where an
  // earlier version derived the twin from the raw URI and emitted nothing at
  // all for a page, because "/about/index.html" has a dot and no trailing
  // slash. Both forms are handled now rather than relying on which arrives.
  it.each([
    ["/", "https://jgreen.one/index.md"],
    ["/index.html", "https://jgreen.one/index.md"],
    ["/about/", "https://jgreen.one/about/index.md"],
    ["/about", "https://jgreen.one/about/index.md"],
    ["/about/index.html", "https://jgreen.one/about/index.md"],
    ["/blog/", "https://jgreen.one/blog/index.md"],
    ["/blog/index.html", "https://jgreen.one/blog/index.md"],
    ["/tags/astro/", "https://jgreen.one/tags/astro/index.md"],
    ["/tags/astro/index.html", "https://jgreen.one/tags/astro/index.md"],
    ["/entries/this-site/", "https://jgreen.one/entries/this-site/index.md"],
    ["/entries/this-site/index.html", "https://jgreen.one/entries/this-site/index.md"],
  ])("%s advertises %s", (uri, twin) => {
    expect(linkOf(uri)).toBe(`<${twin}>; rel="alternate"; type="text/markdown"`);
  });

  // Anything already naming a file is an asset or the twin itself. Neither has
  // a twin of its own, and claiming one would point at a file that is not there.
  it.each([
    "/llms.txt",
    "/robots.txt",
    "/sitemap-index.xml",
    "/media/hero.webp",
    "/entries/this-site/index.md",
    "/favicon.ico",
  ])("%s advertises nothing", (uri) => {
    expect(linkOf(uri)).toBeUndefined();
  });

  it("does not disturb a Link header the origin already set", () => {
    const existing = { link: { value: '</style.css>; rel="preload"' } };
    expect(respond("/blog/", existing).headers.link.value).toBe('</style.css>; rel="preload"');
  });
});

describe("the token count", () => {
  // Cloudflare's Markdown for Agents exposes x-markdown-tokens so a client can
  // budget context before fetching. The count is computed at build time and
  // carried on the object as S3 user metadata; this renames it to the header
  // agents actually look for.
  it("promotes the S3 metadata to the documented header name", () => {
    const headers = {
      "content-type": { value: "text/markdown; charset=utf-8" },
      "x-amz-meta-markdown-tokens": { value: "1234" },
    };
    expect(respond("/blog/index.md", headers).headers["x-markdown-tokens"].value).toBe("1234");
  });

  it("does nothing when the object carries no count", () => {
    const headers = { "content-type": { value: "text/markdown; charset=utf-8" } };
    expect(respond("/blog/index.md", headers).headers["x-markdown-tokens"]).toBeUndefined();
  });

  it("ignores a count on something that is not Markdown", () => {
    const headers = {
      "content-type": { value: "text/html" },
      "x-amz-meta-markdown-tokens": { value: "999" },
    };
    expect(respond("/blog/", headers).headers["x-markdown-tokens"]).toBeUndefined();
  });

  it("ignores a non-numeric count rather than passing it on", () => {
    const headers = {
      "content-type": { value: "text/markdown" },
      "x-amz-meta-markdown-tokens": { value: "not-a-number" },
    };
    expect(respond("/x/index.md", headers).headers["x-markdown-tokens"]).toBeUndefined();
  });
});

describe("robustness — this runs on every response", () => {
  it("does not throw when there are no response headers", () => {
    expect(() => handler({ request: { uri: "/" }, response: { statusCode: 200 } })).not.toThrow();
  });

  it("does not throw when there is no request", () => {
    expect(() => handler({ response: { statusCode: 200, headers: {} } })).not.toThrow();
  });

  it("does not throw on an unusual but legal URI", () => {
    expect(() => respond("/tags/c%2B%2B/")).not.toThrow();
  });

  it("returns the response object, not the event", () => {
    const out = respond("/blog/");
    expect(out).toHaveProperty("headers");
    expect(out).not.toHaveProperty("request");
  });
});

describe("CloudFront Functions runtime constraints", () => {
  it("uses no ES6 syntax the runtime rejects at parse time", () => {
    expect(SOURCE).not.toMatch(/\b(const|let)\s/);
    expect(SOURCE).not.toMatch(/=>/);
    expect(SOURCE).not.toMatch(/`/);
  });

  it("declares the handler as a plain function", () => {
    expect(SOURCE).toMatch(/function handler\s*\(/);
  });
});

/**
 * `Vary: Accept`.
 *
 * The same URL returns HTML or Markdown depending on the request's Accept
 * header. Without `Vary`, a shared cache is entitled to store one and serve it
 * for the other — RFC 9110 §12.5.5 says a server SHOULD send Vary when
 * representation selection depends on anything beyond method and target.
 *
 * CloudFront's own cache is already safe, because the viewer-request function
 * rewrites the URI before the cache lookup and the two variants therefore
 * occupy different keys. The gap is everything downstream: browsers, corporate
 * proxies, any intermediary.
 *
 * The Markdown response is the more important of the two to mark. A cache
 * holding Markdown under a page URL and serving it to a browser is the failure
 * that actually breaks a reader.
 */
describe("Vary: Accept on the negotiated representations", () => {
  const varyOf = (uri: string, headers = {}) => respond(uri, headers).headers.vary?.value;

  it("marks an HTML page", () => {
    expect(varyOf("/entries/this-site/index.html")).toBe("Accept");
  });

  it("marks the Markdown twin, which is the same resource by another name", () => {
    expect(
      varyOf("/entries/this-site/index.md", {
        "content-type": { value: "text/markdown; charset=utf-8" },
      }),
    ).toBe("Accept");
  });

  it("marks the homepage", () => {
    expect(varyOf("/index.html")).toBe("Accept");
  });

  // An asset is one representation only. Declaring Vary there fragments a
  // cache across every distinct Accept header for no benefit.
  it.each([
    ["/media/hero.webp", { "content-type": { value: "image/webp" } }],
    ["/_astro/Base.abc123.css", { "content-type": { value: "text/css" } }],
    ["/llms.txt", { "content-type": { value: "text/plain; charset=utf-8" } }],
    ["/sitemap-index.xml", { "content-type": { value: "application/xml" } }],
  ])("leaves %s alone", (uri, headers) => {
    expect(varyOf(uri, headers)).toBeUndefined();
  });

  describe("an existing Vary from the origin", () => {
    it("is appended to, never overwritten", () => {
      const vary = varyOf("/about/index.html", { vary: { value: "Origin" } });
      expect(vary).toContain("Origin");
      expect(vary).toContain("Accept");
    });

    it("is left alone when it already covers Accept", () => {
      expect(varyOf("/about/index.html", { vary: { value: "Accept" } })).toBe("Accept");
    });

    it("recognises Accept whatever its case", () => {
      expect(varyOf("/about/index.html", { vary: { value: "accept" } })).toBe("accept");
      expect(varyOf("/about/index.html", { vary: { value: "Origin, ACCEPT" } })).toBe(
        "Origin, ACCEPT",
      );
    });

    // "Accepted-Encoding" contains "accept" but is a different field.
    it("is not fooled by a header that merely starts with the same letters", () => {
      // "Accept-Encoding" is a different field; Accept still has to be added.
      expect(varyOf("/about/index.html", { vary: { value: "Accept-Encoding" } })).toBe(
        "Accept-Encoding, Accept",
      );
    });
  });

  it("does not throw when the response carries no headers at all", () => {
    expect(() => handler({ request: { uri: "/about/index.html" }, response: {} })).not.toThrow();
  });
});

/**
 * `X-Robots-Tag: noindex` on the twin's own URL.
 *
 * The twins are now linked from every article, so they are genuinely
 * discoverable — which is exactly when Google needs telling to index the HTML
 * rather than 37 near-duplicates of it.
 *
 * noindex does not prevent fetching; it cannot, since the crawler has to fetch
 * the response to read the header. Content negotiation, ClaudeBot, GPTBot and
 * the copy button are all unaffected.
 *
 * The subtlety: a NEGOTIATED Markdown response is served at the *page* URL, and
 * marking that noindex would tell a crawler not to index the article itself.
 * The two cases arrive with the same rewritten URI, so they are told apart by
 * whether the request asked for Markdown.
 */
describe("X-Robots-Tag on the Markdown twin", () => {
  const robotsFor = (uri: string, accept: string | null, contentType: string) =>
    handler({
      request: { uri, headers: accept === null ? {} : { accept: { value: accept } } },
      response: { statusCode: 200, headers: { "content-type": { value: contentType } } },
    }).headers["x-robots-tag"]?.value;

  const MD = "text/markdown; charset=utf-8";

  it("marks a direct request for the twin's own URL", () => {
    expect(robotsFor("/entries/x/index.md", null, MD)).toBe("noindex");
  });

  it("marks it for a browser-shaped Accept too", () => {
    expect(robotsFor("/entries/x/index.md", "text/html,*/*", MD)).toBe("noindex");
  });

  // The page's own URL must never be told not to index itself.
  it("leaves a negotiated Markdown response unmarked", () => {
    expect(robotsFor("/entries/x/index.md", "text/markdown, */*", MD)).toBeUndefined();
  });

  it("is case-insensitive about the negotiated Accept", () => {
    expect(robotsFor("/entries/x/index.md", "TEXT/MARKDOWN", MD)).toBeUndefined();
  });

  it("never marks an HTML page", () => {
    expect(robotsFor("/entries/x/index.html", "text/html", "text/html")).toBeUndefined();
  });

  it.each([
    ["/media/hero.webp", "image/webp"],
    ["/llms.txt", "text/plain; charset=utf-8"],
  ])("never marks %s", (uri, ctype) => {
    expect(robotsFor(uri, null, ctype)).toBeUndefined();
  });
});
