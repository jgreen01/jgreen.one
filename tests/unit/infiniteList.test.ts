import { describe, it, expect } from "vitest";
import {
  INITIAL_VISIBLE,
  BATCH_SIZE,
  revealMore,
  isComplete,
  remaining,
} from "../../src/utils/infiniteList";

describe("the reveal batch sizes", () => {
  it("starts with a handful and grows by a handful", () => {
    expect(INITIAL_VISIBLE).toBeGreaterThan(0);
    expect(BATCH_SIZE).toBeGreaterThan(0);
  });
});

describe("revealMore", () => {
  it("adds a batch when there is plenty left", () => {
    expect(revealMore(5, 40, 5)).toBe(10);
  });

  // The last batch is nearly always short. Overshooting would index past the
  // end of the list and hide nothing while claiming more was revealed.
  it("stops exactly at the total rather than overshooting", () => {
    expect(revealMore(5, 6, 5)).toBe(6);
  });

  it("is a no-op once everything is visible", () => {
    expect(revealMore(6, 6, 5)).toBe(6);
  });

  it("never exceeds the total even if called past the end", () => {
    expect(revealMore(99, 6, 5)).toBe(6);
  });

  it("defaults to the standard batch size", () => {
    expect(revealMore(0, 100)).toBe(BATCH_SIZE);
  });

  // A zero or negative batch would attach an observer that reveals nothing,
  // so the sentinel would sit in view firing forever.
  it("always advances by at least one, whatever batch size is passed", () => {
    expect(revealMore(2, 10, 0)).toBe(3);
    expect(revealMore(2, 10, -5)).toBe(3);
  });

  it("treats an empty list as already complete", () => {
    expect(revealMore(0, 0, 5)).toBe(0);
  });
});

describe("isComplete", () => {
  it("is false while items remain hidden", () => {
    expect(isComplete(5, 6)).toBe(false);
  });

  it("is true once the visible count reaches the total", () => {
    expect(isComplete(6, 6)).toBe(true);
  });

  it("is true when the list is shorter than the first batch", () => {
    expect(isComplete(INITIAL_VISIBLE, 3)).toBe(true);
  });

  it("is true for an empty list, so no observer is ever attached", () => {
    expect(isComplete(0, 0)).toBe(true);
  });
});

describe("remaining", () => {
  it("counts the hidden items", () => {
    expect(remaining(5, 6)).toBe(1);
  });

  it("is zero when everything is shown", () => {
    expect(remaining(6, 6)).toBe(0);
  });

  it("never goes negative", () => {
    expect(remaining(99, 6)).toBe(0);
  });
});
