import { describe, it, expect } from "vitest";
import { BLINK_MIN_MS, BLINK_MAX_MS, nextBlinkDelay } from "../../src/utils/nazar";

describe("nextBlinkDelay", () => {
  // The footer eye blinks on its own. A fixed interval reads as a machine
  // ticking; a random one inside a wide range reads as something alive, which
  // is the entire point of the effect.
  it("returns the low end of the range for random() = 0", () => {
    expect(nextBlinkDelay(() => 0)).toBe(BLINK_MIN_MS);
  });

  it("returns just under the high end for random() approaching 1", () => {
    expect(nextBlinkDelay(() => 0.999999)).toBeLessThanOrEqual(BLINK_MAX_MS);
    expect(nextBlinkDelay(() => 0.999999)).toBeGreaterThan(BLINK_MAX_MS - 1);
  });

  it("returns the midpoint for random() = 0.5", () => {
    expect(nextBlinkDelay(() => 0.5)).toBe((BLINK_MIN_MS + BLINK_MAX_MS) / 2);
  });

  it("always lands inside the range across many draws", () => {
    for (let i = 0; i < 200; i += 1) {
      const delay = nextBlinkDelay();
      expect(delay).toBeGreaterThanOrEqual(BLINK_MIN_MS);
      expect(delay).toBeLessThanOrEqual(BLINK_MAX_MS);
    }
  });

  it("does not return the same value every time", () => {
    const draws = new Set(Array.from({ length: 50 }, () => nextBlinkDelay()));
    expect(draws.size).toBeGreaterThan(1);
  });

  it("returns whole milliseconds, so a timer is not handed a fraction", () => {
    expect(Number.isInteger(nextBlinkDelay(() => 0.3333333))).toBe(true);
  });
});

describe("the range itself", () => {
  // Rarity is what keeps this from becoming noise in a footer that appears on
  // every page. Fast enough to be seen, slow enough to stay a surprise.
  it("is slow enough that the eye is still most of the time", () => {
    expect(BLINK_MIN_MS).toBeGreaterThanOrEqual(5000);
  });

  it("is wide enough that the rhythm is not predictable", () => {
    expect(BLINK_MAX_MS - BLINK_MIN_MS).toBeGreaterThanOrEqual(4000);
  });

  it("is bounded so the eye does not appear dead on a long page", () => {
    expect(BLINK_MAX_MS).toBeLessThanOrEqual(20000);
  });
});
