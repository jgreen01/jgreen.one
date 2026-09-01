import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Tests for the CloudFront viewer-request function.
 *
 * This function runs on **every request to the site**. An unhandled exception in
 * it returns HTTP 503 — so a bug here is a full outage, not a degraded feature.
 * That is why the existing clean-URL rewrites are covered here as a baseline,
 * written before the Accept branch was added.
 *
 * These tests run on Node, which supports far more than the CloudFront Functions
 * ES5.1 runtime. They cannot catch `const`, arrow functions or
 * `String.prototype.includes`. Two other things do: the ESLint config pinned to
 * ecmaVersion 5, and `aws cloudfront test-function`, which runs the real engine.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL("../../infra/live/function.js", import.meta.url)),
  "utf-8",
);

/** Loads the function from source, the way CloudFront would. */
function loadHandler(): (event: unknown) => { uri: string; headers: object } {
  // eslint-disable-next-line no-new-func
  return new Function(`${SOURCE}; return handler;`)() as never;
}

const handler = loadHandler();

const requestFor = (uri: string, headers: Record<string, { value: string }> = {}) =>
  handler({
    version: "1.0",
    context: { eventType: "viewer-request" },
    viewer: { ip: "203.0.113.1" },
    request: { method: "GET", uri, headers, cookies: {}, querystring: {} },
  });

const HTML_ACCEPT = {
  accept: { value: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
};
const MD_ACCEPT = { accept: { value: "text/markdown, text/html, */*" } };

describe("clean-URL rewrites (baseline — behaviour that predates any negotiation)", () => {
  it.each([
    ["/", "/index.html"],
    ["/blog/", "/blog/index.html"],
    ["/entries/how-this-site-was-made/", "/entries/how-this-site-was-made/index.html"],
  ])("appends index.html to %s", (uri, expected) => {
    expect(requestFor(uri).uri).toBe(expected);
  });

  it.each([
    ["/about", "/about/index.html"],
    ["/contact", "/contact/index.html"],
  ])("appends /index.html to the extensionless %s", (uri, expected) => {
    expect(requestFor(uri).uri).toBe(expected);
  });

  it.each([
    "/favicon.svg",
    "/robots.txt",
    "/media/how-this-website-was-built.png",
    "/sitemap-index.xml",
    "/_astro/Base.CDsf8S6K.css",
  ])("leaves %s untouched because it has an extension", (uri) => {
    expect(requestFor(uri).uri).toBe(uri);
  });

  it("returns the request object, not a response", () => {
    const result = requestFor("/");
    expect(result).toHaveProperty("uri");
    expect(result).not.toHaveProperty("statusCode");
  });
});

describe("robustness — the cases that would 503 the site", () => {
  it("does not throw when there are no headers at all", () => {
    // The function reads headers['accept'].value; an absent header is a
    // TypeError, and a TypeError in a viewer-request function is a 503.
    expect(() => requestFor("/about")).not.toThrow();
  });

  it("does not throw when accept is present but empty", () => {
    expect(() => requestFor("/about", { accept: { value: "" } })).not.toThrow();
  });

  it("does not throw for an unusual but legal URI", () => {
    expect(() => requestFor("/entries/a-b_c.d/")).not.toThrow();
  });

  it.each(["/", "/about", "/x.png", "/deeply/nested/path/"])(
    "always returns a uri for %s",
    (uri) => {
      expect(typeof requestFor(uri).uri).toBe("string");
    },
  );
});

describe("content negotiation on Accept", () => {
  it("serves the Markdown copy when an entry page asks for text/markdown", () => {
    expect(requestFor("/entries/how-this-site-was-made/", MD_ACCEPT).uri).toBe(
      "/entries/how-this-site-was-made/index.md",
    );
  });

  it("works for an extensionless entry URL too", () => {
    expect(requestFor("/entries/how-this-site-was-made", MD_ACCEPT).uri).toBe(
      "/entries/how-this-site-was-made/index.md",
    );
  });

  it("serves HTML to a browser, which is what keeps this out of cloaking territory", () => {
    expect(requestFor("/entries/how-this-site-was-made/", HTML_ACCEPT).uri).toBe(
      "/entries/how-this-site-was-made/index.html",
    );
  });

  it("serves HTML when there is no accept header", () => {
    expect(requestFor("/entries/how-this-site-was-made/").uri).toBe(
      "/entries/how-this-site-was-made/index.html",
    );
  });

  describe("never negotiates outside /entries/", () => {
    it.each(["/", "/about", "/blog/", "/tags/astro/", "/projects/"])(
      "%s stays HTML even when markdown is requested",
      (uri) => {
        expect(requestFor(uri, MD_ACCEPT).uri).toMatch(/index\.html$/);
      },
    );
  });

  it("does not rewrite a request that already names a file", () => {
    expect(requestFor("/media/hero.png", MD_ACCEPT).uri).toBe("/media/hero.png");
  });

  it("does not rewrite the entries index itself", () => {
    // /entries/ is a listing page; there is no markdown copy of it.
    expect(requestFor("/entries/", MD_ACCEPT).uri).toBe("/entries/index.html");
  });

  it("matches the media type case-insensitively", () => {
    const upper = { accept: { value: "TEXT/MARKDOWN" } };
    expect(requestFor("/entries/x/", upper).uri).toBe("/entries/x/index.md");
  });

  it("is not fooled by markdown appearing elsewhere in the header", () => {
    // A header mentioning markdown in a parameter, not as a media type.
    const tricky = { accept: { value: "text/html;profile=markdown" } };
    expect(requestFor("/entries/x/", tricky).uri).toBe("/entries/x/index.html");
  });
});

describe("CloudFront Functions runtime constraints", () => {
  // The limit is ES5.1 **syntax**, not the ES5.1 standard library. Probed
  // against the real engine on 2026-09-01 with `aws cloudfront test-function`:
  // String.includes, String.startsWith, Array.includes, Array.some and
  // Object.assign all work. The existing clean-URL rewrite has been using
  // `uri.includes('.')` in production all along.
  //
  // Syntax is what fails, and it fails at parse time with a SyntaxError —
  // which means every request 503s, not just the one exercising the new path.
  // Comments are stripped first: prose about `String.includes` is not code, and
  // a check that flags its own documentation is a check nobody will keep.
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it.each([
    ["const/let", /\b(const|let)\s/],
    ["arrow functions", /=>/],
    ["template literals", /`/],
    ["spread or rest", /\.\.\./],
    ["destructuring", /^\s*var\s*[{[]/m],
  ])("uses no %s", (_label, pattern) => {
    expect(CODE).not.toMatch(pattern);
  });

  it("declares the handler as a plain function", () => {
    expect(SOURCE).toMatch(/function handler\s*\(/);
  });
});
