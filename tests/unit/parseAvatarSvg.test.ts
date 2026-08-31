import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAvatarSvg, avatarSvgAttributes } from "../../src/utils/parseAvatarSvg";
import {
  recordedAvatarSvg,
  svgWithOwnViewBox,
  svgMissingRoot,
  emptySvg,
} from "../fixtures/avatarSvg";

describe("parseAvatarSvg", () => {
  describe("valid SVG", () => {
    it("returns the root attributes and inner markup", () => {
      const { attributes, innerHTML } = parseAvatarSvg(recordedAvatarSvg);
      expect(attributes).toMatchObject({
        "xmlns:ns0": "http://www.w3.org/2000/svg",
        version: "1.1",
      });
      expect(innerHTML).toContain("<path");
      expect(innerHTML).toContain('fill="var(--ink)"');
    });

    it("does not include the root <svg> tag in innerHTML", () => {
      const { innerHTML } = parseAvatarSvg(recordedAvatarSvg);
      expect(innerHTML).not.toContain("<svg");
      expect(innerHTML).not.toContain("</svg>");
    });

    it("preserves every child path", () => {
      const { innerHTML } = parseAvatarSvg(recordedAvatarSvg);
      expect(innerHTML.match(/<path/g)).toHaveLength(2);
    });
  });

  describe("missing root element", () => {
    it.each([
      ["markup with no <svg>", svgMissingRoot],
      ["an empty string", emptySvg],
    ])("throws on %s", (_label, input) => {
      expect(() => parseAvatarSvg(input)).toThrow("Avatar: no <svg> element found");
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
    ])("throws the same error on %s rather than a TypeError", (_label, input) => {
      // The `?? ""` guard means a missing import resolves to the same clear
      // message instead of an opaque parser crash.
      expect(() => parseAvatarSvg(input as unknown as string)).toThrow(
        "Avatar: no <svg> element found",
      );
    });
  });
});

describe("avatarSvgAttributes", () => {
  it("merges parsed attributes with caller props", () => {
    const { attributes } = parseAvatarSvg(recordedAvatarSvg);
    const merged = avatarSvgAttributes(attributes, { class: "avatar w-3/5" });
    expect(merged.version).toBe("1.1");
    expect(merged.class).toBe("avatar w-3/5");
  });

  it("lets caller props override matching SVG attributes", () => {
    const { attributes } = parseAvatarSvg(svgWithOwnViewBox);
    const merged = avatarSvgAttributes(attributes, { class: "overridden" });
    expect(merged.class).toBe("overridden");
  });

  it("always forces viewBox to '0 0 1000 1000' when the source has none", () => {
    const { attributes } = parseAvatarSvg(recordedAvatarSvg);
    expect(attributes.viewBox).toBeUndefined();
    expect(avatarSvgAttributes(attributes, {}).viewBox).toBe("0 0 1000 1000");
  });

  it("overrides a viewBox that the source SVG already declares", () => {
    const { attributes } = parseAvatarSvg(svgWithOwnViewBox);
    expect(attributes.viewBox).toBe("0 0 24 24");
    expect(avatarSvgAttributes(attributes, {}).viewBox).toBe("0 0 1000 1000");
  });

  it("wins over a viewBox passed in as a prop", () => {
    const { attributes } = parseAvatarSvg(recordedAvatarSvg);
    const merged = avatarSvgAttributes(attributes, { viewBox: "0 0 50 50" });
    expect(merged.viewBox).toBe("0 0 1000 1000");
  });

  it("does not mutate the attributes object it was given", () => {
    const { attributes } = parseAvatarSvg(recordedAvatarSvg);
    avatarSvgAttributes(attributes, { class: "x" });
    expect(attributes.viewBox).toBeUndefined();
    expect(attributes.class).toBeUndefined();
  });
});

describe("the real avatar asset", () => {
  // Guard against the checked-in asset being corrupted or replaced with markup
  // the component cannot parse. Reads a repo-tracked file, so it stays
  // deterministic — unlike reading generated output or live content.
  const realSvg = readFileSync(
    fileURLToPath(new URL("../../src/assets/avatar.svg", import.meta.url)),
    "utf-8",
  );

  it("parses without throwing", () => {
    expect(() => parseAvatarSvg(realSvg)).not.toThrow();
  });

  it("still lacks its own viewBox, so the forced one is load-bearing", () => {
    const { attributes } = parseAvatarSvg(realSvg);
    expect(attributes.viewBox).toBeUndefined();
    expect(avatarSvgAttributes(attributes, {}).viewBox).toBe("0 0 1000 1000");
  });

  it("contains drawable content", () => {
    const { innerHTML } = parseAvatarSvg(realSvg);
    expect(innerHTML).toContain("<path");
  });
});
