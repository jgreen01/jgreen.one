// Forced before anything imports a formatter, so the assertions below run in a
// timezone whose local calendar day differs from UTC for a midnight date. This
// is the whole point of the suite: on a UTC machine the bug is invisible.
process.env.TZ = "America/Los_Angeles";

import { describe, it, expect } from "vitest";
import { formatDate, formatLongDate } from "../../src/utils/formatDate";

describe("formatDate", () => {
  // Frontmatter dates are bare `YYYY-MM-DD`, which Zod coerces to midnight UTC.
  // Rendered in a negative-offset local timezone that lands on the day before,
  // so an entry published on the 30th displayed as the 29th.
  it("keeps a midnight-UTC date on its own calendar day", () => {
    expect(formatDate(new Date("2026-07-30T00:00:00.000Z"))).toBe("Jul 30, 2026");
  });

  it("does not roll a New Year's Day date back into the previous year", () => {
    expect(formatDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("Jan 1, 2026");
  });

  it("holds at the very end of a day too", () => {
    expect(formatDate(new Date("2026-07-30T23:59:59.000Z"))).toBe("Jul 30, 2026");
  });

  it.each([
    ["2025-09-21T00:00:00.000Z", "Sep 21, 2025"],
    ["2025-12-11T00:00:00.000Z", "Dec 11, 2025"],
    ["2026-08-31T00:00:00.000Z", "Aug 31, 2026"],
  ])("formats %s as %s", (iso, expected) => {
    expect(formatDate(new Date(iso))).toBe(expected);
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatDate("2026-07-30")).toBe("Jul 30, 2026");
  });

  it("returns an empty string for an unparseable value rather than 'Invalid Date'", () => {
    expect(formatDate("not a date")).toBe("");
  });
});

describe("formatLongDate", () => {
  it("keeps a midnight-UTC date on its own calendar day", () => {
    expect(formatLongDate(new Date("2025-12-11T00:00:00.000Z"))).toBe("11 December 2025");
  });

  it("spells the month out in full", () => {
    expect(formatLongDate(new Date("2026-07-30T00:00:00.000Z"))).toBe("30 July 2026");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatLongDate("nonsense")).toBe("");
  });
});
