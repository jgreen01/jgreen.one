import { describe, it, expect } from "vitest";
import { estimateTokens } from "../../scripts/lib/tokens.mjs";

describe("estimateTokens", () => {
  // The number is advertised as x-markdown-tokens so an agent can budget
  // context before fetching. It is an estimate by construction: the real count
  // depends on the tokeniser, which differs per model. What matters is that it
  // is the right order of magnitude and never wildly under.
  it("is zero for an empty document", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("is zero for whitespace only", () => {
    expect(estimateTokens("   \n\n\t ")).toBe(0);
  });

  it("counts a short sentence in single digits", () => {
    const n = estimateTokens("The quick brown fox jumps over the lazy dog.");
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(20);
  });

  it("grows roughly with length", () => {
    const short = estimateTokens("word ".repeat(100));
    const long = estimateTokens("word ".repeat(1000));
    expect(long).toBeGreaterThan(short * 5);
  });

  it("returns a whole number", () => {
    expect(Number.isInteger(estimateTokens("some prose here"))).toBe(true);
  });

  it("never returns a negative number", () => {
    expect(estimateTokens("a")).toBeGreaterThanOrEqual(0);
  });

  // A thousand words of English is roughly 1300 tokens on common tokenisers.
  // Being within a factor of two is the useful bar, not exactness.
  it("lands in the right order of magnitude for real prose", () => {
    const words = "the quick brown fox jumps over a lazy dog and then rests ".repeat(100);
    const n = estimateTokens(words);
    expect(n).toBeGreaterThan(600);
    expect(n).toBeLessThan(2600);
  });

  it("handles a document that is mostly punctuation without collapsing", () => {
    expect(estimateTokens("### --- ***".repeat(50))).toBeGreaterThan(0);
  });

  it("does not throw on undefined or null", () => {
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });
});
