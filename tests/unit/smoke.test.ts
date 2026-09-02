import { describe, it, expect } from "vitest";
import {
  smokeTargets,
  screenshotName,
  isIgnorableConsoleMessage,
  summarise,
  isExpectedStatus,
} from "../../scripts/lib/smoke.mjs";

describe("smokeTargets", () => {
  const config = {
    routes: ["/", "/about"],
    viewports: [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile", width: 390, height: 844 },
    ],
    themes: ["light", "dark"] as const,
  };

  it("covers every route in every viewport in every theme", () => {
    expect(smokeTargets(config)).toHaveLength(2 * 2 * 2);
  });

  it("carries the viewport dimensions through to each target", () => {
    const target = smokeTargets(config)[0];
    expect(target.viewport).toEqual({ name: "desktop", width: 1280, height: 800 });
  });

  it("groups by route so a run reads in page order, not shuffled", () => {
    expect(smokeTargets(config).map((t) => t.route)).toEqual([
      "/",
      "/",
      "/",
      "/",
      "/about",
      "/about",
      "/about",
      "/about",
    ]);
  });

  it("returns nothing when any dimension is empty", () => {
    expect(smokeTargets({ ...config, routes: [] })).toEqual([]);
    expect(smokeTargets({ ...config, themes: [] })).toEqual([]);
  });
});

describe("screenshotName", () => {
  it.each([
    ["/", "desktop", "light", "home--desktop--light.png"],
    ["/about", "mobile", "dark", "about--mobile--dark.png"],
    ["/entries/a-post/", "desktop", "dark", "entries-a-post--desktop--dark.png"],
  ])("names %s / %s / %s as %s", (route, viewport, theme, expected) => {
    expect(screenshotName(route, viewport, theme)).toBe(expected);
  });

  it("produces a filename with no path separators", () => {
    expect(screenshotName("/a/b/c", "desktop", "light")).not.toContain("/");
  });

  it("does not collide for routes differing only by trailing slash", () => {
    expect(screenshotName("/blog", "desktop", "light")).toBe(
      screenshotName("/blog/", "desktop", "light"),
    );
  });
});

describe("isIgnorableConsoleMessage", () => {
  // The smoke run should be loud about real problems and silent about the
  // handful of messages a dev server always emits.
  it("ignores a message matching a configured pattern", () => {
    expect(isIgnorableConsoleMessage("[vite] connected.", ["[vite]"])).toBe(true);
  });

  it("does not ignore an unrelated message", () => {
    expect(isIgnorableConsoleMessage("TypeError: x is undefined", ["[vite]"])).toBe(false);
  });

  it("ignores nothing when no patterns are configured", () => {
    expect(isIgnorableConsoleMessage("anything at all", [])).toBe(false);
  });
});

describe("summarise", () => {
  const results = [
    { route: "/", ok: true, errors: [], status: 200 },
    { route: "/about", ok: false, errors: ["boom"], status: 200 },
    { route: "/gone", ok: false, errors: [], status: 404 },
  ];

  it("counts passes and failures", () => {
    const summary = summarise(results);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(2);
  });

  it("lists only the failing routes", () => {
    expect(summarise(results).failures.map((f) => f.route)).toEqual(["/about", "/gone"]);
  });

  it("reports a clean run as passing", () => {
    const summary = summarise([{ route: "/", ok: true, errors: [], status: 200 }]);
    expect(summary.failed).toBe(0);
    expect(summary.failures).toEqual([]);
  });
});

describe("isExpectedStatus", () => {
  // The 404 page is the one route whose correct answer is a 4xx. Encoding that
  // once stops the navigation check and the sub-resource check disagreeing
  // about whether the same response is a failure.
  it.each([
    ["/", 200, true],
    ["/about", 200, true],
    ["/about", 404, false],
    ["/about", 500, false],
    ["/404", 404, true],
    ["/404", 200, true],
    ["/404", 500, false],
  ])("route %s answering %i is expected: %s", (route, status, expected) => {
    expect(isExpectedStatus(route, status)).toBe(expected);
  });

  it("treats a missing status as a failure", () => {
    expect(isExpectedStatus("/", 0)).toBe(false);
  });
});
