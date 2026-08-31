import { describe, it, expect } from "vitest";
import {
  START_YEAR,
  BUILD_YEAR,
  copyrightLabel,
  clientCopyrightLabel,
} from "../../src/utils/copyright";

/** The en dash (U+2013) is the correct separator for a year range. */
const EN_DASH = "–";

describe("START_YEAR", () => {
  it("is the year the site began", () => {
    // First commit 2025-08-11, earliest entry pubDate 2025-08-14, LICENSE.txt 2025.
    expect(START_YEAR).toBe(2025);
  });
});

describe("BUILD_YEAR", () => {
  it("is the year the build ran", () => {
    expect(BUILD_YEAR).toBe(new Date().getFullYear());
  });

  it("is not earlier than the start year", () => {
    expect(BUILD_YEAR).toBeGreaterThanOrEqual(START_YEAR);
  });
});

describe("copyrightLabel", () => {
  describe("single year", () => {
    it("renders just the start year when the years match", () => {
      expect(copyrightLabel(2025, 2025)).toBe("2025");
    });

    it("never renders a range running backwards", () => {
      // A visitor with a badly-set clock must not produce "2025–2024".
      expect(copyrightLabel(2025, 2024)).toBe("2025");
    });
  });

  describe("range", () => {
    it.each([
      [2025, 2026, `2025${EN_DASH}2026`],
      [2025, 2027, `2025${EN_DASH}2027`],
      [2025, 2099, `2025${EN_DASH}2099`],
    ])("renders %i and %i as %s", (start, current, expected) => {
      expect(copyrightLabel(start, current)).toBe(expected);
    });
  });

  describe("separator", () => {
    it("uses an en dash, not a hyphen", () => {
      // Trivial to get wrong in an editor and invisible in review.
      const label = copyrightLabel(2025, 2026);
      expect(label).toContain(EN_DASH);
      expect(label).not.toContain("-");
    });
  });
});

describe("clientCopyrightLabel", () => {
  // Returns null when the build-time output should stand, so the inline script
  // only ever assigns on a real change.
  it("returns null when the clock matches the start year", () => {
    expect(clientCopyrightLabel(2025, 2025)).toBeNull();
  });

  it("returns null when the clock is behind the start year", () => {
    expect(clientCopyrightLabel(2025, 2020)).toBeNull();
  });

  it.each([0, Number.NaN])("returns null for a missing start year (%o)", (start) => {
    // `Number(el.dataset.startYear)` yields 0 or NaN when the attribute is
    // absent or malformed; neither may blank out the footer.
    expect(clientCopyrightLabel(start, 2030)).toBeNull();
  });

  it("returns the range when the clock is ahead", () => {
    expect(clientCopyrightLabel(2025, 2026)).toBe(`2025${EN_DASH}2026`);
  });

  it("promotes a single year straight into a range", () => {
    // The build may have rendered "2025"; a 2099 clock must still produce a range.
    expect(clientCopyrightLabel(2025, 2099)).toBe(`2025${EN_DASH}2099`);
  });

  it("agrees with copyrightLabel whenever it returns a value", () => {
    for (const now of [2026, 2030, 2099]) {
      expect(clientCopyrightLabel(2025, now)).toBe(copyrightLabel(2025, now));
    }
  });
});
