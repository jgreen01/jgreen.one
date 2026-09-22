import { describe, it, expect, vi } from "vitest";
import { copyText, formatTokenCount } from "../../src/utils/copyMarkdown";

describe("formatTokenCount", () => {
  it("groups thousands so a budget is readable at a glance", () => {
    expect(formatTokenCount(1200)).toBe("≈1,200 tokens");
  });

  it("handles a small count", () => {
    expect(formatTokenCount(1)).toBe("≈1 token");
    expect(formatTokenCount(940)).toBe("≈940 tokens");
  });

  it("returns null for a count that is missing or nonsense, rather than guessing", () => {
    expect(formatTokenCount(NaN)).toBeNull();
    expect(formatTokenCount(0)).toBeNull();
    expect(formatTokenCount(-5)).toBeNull();
  });
});

describe("copyText", () => {
  // The known failure of this pattern is a button that silently does nothing.
  // copyText reports success or failure so the caller can always say something.
  it("writes through the Clipboard API when it works", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyText("hello", { clipboard: { writeText } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("reports failure when the Clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    expect(await copyText("hello", { clipboard: { writeText } })).toBe(false);
  });

  it("reports failure when there is no Clipboard API at all", async () => {
    expect(await copyText("hello", {})).toBe(false);
  });

  // An in-app browser or WebView may expose no clipboard object. The promise
  // must still resolve — an unhandled rejection is the dead button again.
  it("never throws, whatever the environment does", async () => {
    const hostile = {
      clipboard: {
        writeText: () => {
          throw new Error("synchronous explosion");
        },
      },
    };
    await expect(copyText("hello", hostile)).resolves.toBe(false);
  });

  it("falls back to the legacy command when the modern API is unavailable", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("hello", { execCommand })).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when the fallback also fails", async () => {
    expect(await copyText("hello", { execCommand: vi.fn().mockReturnValue(false) })).toBe(false);
  });
});
