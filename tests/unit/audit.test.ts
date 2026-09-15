import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CRITICAL_AUDITS,
  CATEGORY_THRESHOLDS,
  evaluateLighthouse,
  summarizeAudit,
} from "../../scripts/lib/audit.mjs";

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../fixtures/${name}.json`), "utf-8"));

// Both fixtures are trimmed recordings of real Lighthouse runs, so the shape
// cannot drift from what the tool actually emits.
const clean = fixture("lighthouse_clean");
const badCanonical = fixture("lighthouse_canonical_to_homepage");

describe("the audits that must always pass", () => {
  it("includes canonical, the check that would have caught the homepage bug", () => {
    expect(CRITICAL_AUDITS).toContain("canonical");
  });

  it("includes crawlability, since a blocked page is invisible", () => {
    expect(CRITICAL_AUDITS).toContain("is-crawlable");
  });

  it("demands a perfect SEO category", () => {
    expect(CATEGORY_THRESHOLDS.seo).toBe(1);
  });
});

describe("evaluateLighthouse", () => {
  it("reports nothing for a clean run of the real site", () => {
    expect(evaluateLighthouse(clean)).toEqual([]);
  });

  // The exact defect shipped this session: every page naming the homepage as
  // its canonical, which tells a search engine the whole site is duplicates.
  it("catches a canonical pointing at the homepage", () => {
    const findings = evaluateLighthouse(badCanonical);
    expect(findings.join(" ")).toMatch(/canonical/i);
  });

  it("quotes Lighthouse's own explanation rather than paraphrasing it", () => {
    expect(evaluateLighthouse(badCanonical).join(" ")).toMatch(/root URL/i);
  });

  it("reports the category falling below its threshold", () => {
    expect(evaluateLighthouse(badCanonical).join(" ")).toMatch(/seo/i);
  });

  it("ignores an audit that is not applicable", () => {
    const lhr = {
      categories: { seo: { score: 1 } },
      audits: { canonical: { id: "canonical", score: null, scoreDisplayMode: "notApplicable" } },
    };
    expect(evaluateLighthouse(lhr)).toEqual([]);
  });

  it("ignores an informational audit that carries no score", () => {
    const lhr = {
      categories: { seo: { score: 1 } },
      audits: { canonical: { id: "canonical", score: null, scoreDisplayMode: "informative" } },
    };
    expect(evaluateLighthouse(lhr)).toEqual([]);
  });

  it("treats a missing category as nothing to judge rather than a failure", () => {
    expect(evaluateLighthouse({ categories: {}, audits: {} })).toEqual([]);
  });

  it("accepts a custom threshold", () => {
    expect(evaluateLighthouse(badCanonical, { thresholds: { seo: 0.5 } }).join(" ")).not.toMatch(
      /below/i,
    );
  });

  // A non-critical audit dipping should not fail the run on its own; the
  // category score already accounts for it.
  it("does not fail on a non-critical audit alone", () => {
    const lhr = {
      categories: { seo: { score: 1 } },
      audits: { "font-size": { id: "font-size", score: 0, scoreDisplayMode: "binary" } },
    };
    expect(evaluateLighthouse(lhr)).toEqual([]);
  });
});

describe("summarizeAudit", () => {
  it("counts pages and failures", () => {
    const summary = summarizeAudit([
      { url: "/", findings: [] },
      { url: "/a", findings: ["canonical"] },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(1);
  });

  it("is clean for an empty run", () => {
    expect(summarizeAudit([])).toEqual({ total: 0, passed: 0, failed: 0, affectedUrls: [] });
  });

  it("lists the urls with problems", () => {
    expect(summarizeAudit([{ url: "/a", findings: ["x"] }]).affectedUrls).toEqual(["/a"]);
  });
});
