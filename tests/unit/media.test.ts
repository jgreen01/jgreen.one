import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ERROR,
  WARN,
  OK,
  sha256,
  contentTypeFor,
  isManagedAsset,
  findMediaReferences,
  buildManifest,
  reconcile,
  shouldFail,
} from "../../scripts/lib/media.mjs";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const manifestEntry = (path: string, overrides: Record<string, unknown> = {}) => ({
  path,
  bytes: 100,
  sha256: HASH_A,
  width: 10,
  height: 10,
  contentType: "image/png",
  addedAt: "2026-08-30",
  referencedBy: ["entries/some-post"],
  ...overrides,
});

const codes = (findings: Array<{ code: string }>) => findings.map((f) => f.code);

describe("sha256", () => {
  it("hashes content, not the filename", () => {
    expect(sha256(Buffer.from("hello"))).toBe(
      // Pinned literal so swapping the algorithm cannot pass silently.
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("changes when a single byte changes", () => {
    expect(sha256(Buffer.from("hello"))).not.toBe(sha256(Buffer.from("hellp")));
  });

  it("is stable across calls", () => {
    expect(sha256(Buffer.from("x"))).toBe(sha256(Buffer.from("x")));
  });
});

describe("contentTypeFor", () => {
  it.each([
    ["a.png", "image/png"],
    ["a.JPG", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.webp", "image/webp"],
    ["a.pdf", "application/pdf"],
    ["a.mp4", "video/mp4"],
  ])("maps %s to %s", (path, expected) => {
    expect(contentTypeFor(path)).toBe(expected);
  });

  it("falls back for an unknown extension", () => {
    expect(contentTypeFor("a.xyz")).toBe("application/octet-stream");
  });

  it("falls back when there is no extension", () => {
    expect(contentTypeFor("README")).toBe("application/octet-stream");
  });
});

describe("isManagedAsset", () => {
  it.each(["hero.png", "clip.mp4", "doc.pdf", "photo.JPEG"])("manages %s", (path) => {
    expect(isManagedAsset(path)).toBe(true);
  });

  it.each(["icon.svg", "notes.md", "data.json", "Makefile"])(
    "does not manage %s",
    (path) => {
      // SVG stays in git: it is text, it diffs, and the build imports it directly.
      expect(isManagedAsset(path)).toBe(false);
    },
  );
});

describe("findMediaReferences", () => {
  it("finds a frontmatter reference", () => {
    expect(findMediaReferences('heroImage: "/media/hero.png"')).toEqual(["hero.png"]);
  });

  it("finds a Markdown body reference", () => {
    expect(findMediaReferences("![alt text](/media/diagram.webp)")).toEqual([
      "diagram.webp",
    ]);
  });

  it("finds references in nested folders", () => {
    expect(findMediaReferences("/media/post-slug/figure-1.png")).toEqual([
      "post-slug/figure-1.png",
    ]);
  });

  it("de-duplicates repeats", () => {
    expect(findMediaReferences("/media/a.png and again /media/a.png")).toEqual(["a.png"]);
  });

  it("ignores paths outside /media/", () => {
    expect(findMediaReferences("/images/old.png /og/thing.png")).toEqual([]);
  });

  it("returns an empty array for content with no images", () => {
    expect(findMediaReferences("# Just a heading\n\nSome prose.")).toEqual([]);
  });
});

describe("buildManifest", () => {
  const file = { path: "b.png", bytes: 10, sha256: HASH_A, width: 4, height: 2, addedAt: "2026-08-30" };

  it("produces one entry per file with the derived fields", () => {
    const [entry] = buildManifest([file]);
    expect(entry).toMatchObject({
      path: "b.png",
      bytes: 10,
      sha256: HASH_A,
      width: 4,
      height: 2,
      contentType: "image/png",
    });
  });

  it("sorts by path so the committed file has a stable diff", () => {
    const manifest = buildManifest([
      { ...file, path: "c.png" },
      { ...file, path: "a.png" },
      { ...file, path: "b.png" },
    ]);
    expect(manifest.map((e) => e.path)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("attaches the content references for each asset", () => {
    const [entry] = buildManifest([file], {
      referencesByPath: { "b.png": ["entries/two", "entries/one"] },
    });
    expect(entry.referencedBy).toEqual(["entries/one", "entries/two"]);
  });

  it("gives an unreferenced asset an empty list rather than omitting the field", () => {
    expect(buildManifest([file])[0].referencedBy).toEqual([]);
  });

  it("preserves the hand-written source field across a regen", () => {
    const previous = [manifestEntry("b.png", { source: "generated (Gemini)" })];
    expect(buildManifest([file], { previous })[0].source).toBe("generated (Gemini)");
  });

  it("omits source entirely when there is none", () => {
    expect(buildManifest([file])[0]).not.toHaveProperty("source");
  });

  it("keeps the original addedAt so it records arrival, not last regen", () => {
    const previous = [manifestEntry("b.png", { addedAt: "2025-01-01" })];
    expect(buildManifest([{ ...file, addedAt: "2026-12-31" }], { previous })[0].addedAt).toBe(
      "2025-01-01",
    );
  });

  it("records dimensions as null when they could not be read", () => {
    const entry = buildManifest([{ path: "a.pdf", bytes: 1, sha256: HASH_A, addedAt: "2026-08-30" }])[0];
    expect(entry.width).toBeNull();
    expect(entry.height).toBeNull();
  });
});

describe("reconcile", () => {
  describe("the healthy case", () => {
    it("reports nothing when all three views agree", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_A }],
        s3: [{ path: "a.png", sha256: HASH_A }],
        references: ["a.png"],
      });
      expect(findings).toEqual([]);
    });
  });

  describe("safe auto-pull", () => {
    it("offers to pull a file that is in the manifest and S3 but not local", () => {
      const [f] = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [],
        s3: [{ path: "a.png", sha256: HASH_A }],
        references: ["a.png"],
      });
      expect(f).toMatchObject({ severity: OK, code: "missing-locally", action: "pull" });
    });

    it("does not offer to pull when the S3 copy has a different hash", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [],
        s3: [{ path: "a.png", sha256: HASH_B }],
        references: ["a.png"],
      });
      expect(codes(findings)).toContain("s3-hash-mismatch");
      expect(findings.find((f) => f.action === "pull")).toBeUndefined();
    });
  });

  describe("errors", () => {
    it("flags an asset missing from S3 as data loss", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_A }],
        s3: [],
        references: ["a.png"],
      });
      expect(findings[0]).toMatchObject({ severity: ERROR, code: "missing-from-s3" });
    });

    it("flags a local file that differs from the manifest", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_B }],
        s3: [{ path: "a.png", sha256: HASH_A }],
        references: ["a.png"],
      });
      expect(codes(findings)).toContain("local-hash-mismatch");
    });

    it("never silently overwrites a differing local file", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_B }],
        s3: [{ path: "a.png", sha256: HASH_A }],
        references: ["a.png"],
      });
      expect(findings.find((f) => f.action === "pull")).toBeUndefined();
    });

    it("flags content referencing an asset the manifest does not know", () => {
      const findings = reconcile({
        manifest: [],
        local: [],
        s3: [],
        references: ["ghost.png"],
      });
      expect(findings[0]).toMatchObject({ severity: ERROR, code: "broken-reference" });
    });
  });

  describe("warnings", () => {
    it("flags an orphan left in the bucket", () => {
      const findings = reconcile({
        manifest: [],
        local: [],
        s3: [{ path: "orphan.png", sha256: HASH_A }],
        references: [],
      });
      expect(findings[0]).toMatchObject({ severity: WARN, code: "orphan-in-s3" });
    });

    it("flags a local file that was never pushed", () => {
      const findings = reconcile({
        manifest: [],
        local: [{ path: "new.png", sha256: HASH_A }],
        s3: [],
        references: [],
      });
      expect(findings[0]).toMatchObject({ severity: WARN, code: "untracked-local" });
    });

    it("flags an asset nothing references", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png", { referencedBy: [] })],
        local: [{ path: "a.png", sha256: HASH_A }],
        s3: [{ path: "a.png", sha256: HASH_A }],
        references: [],
      });
      expect(codes(findings)).toContain("unreferenced");
    });
  });

  describe("offline mode", () => {
    it("makes no S3 judgements when s3 is null", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_A }],
        s3: null,
        references: ["a.png"],
      });
      expect(codes(findings)).not.toContain("missing-from-s3");
      expect(codes(findings)).not.toContain("orphan-in-s3");
      expect(codes(findings)).not.toContain("s3-hash-mismatch");
    });

    it("still catches a local hash mismatch", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "a.png", sha256: HASH_B }],
        s3: null,
        references: ["a.png"],
      });
      expect(codes(findings)).toContain("local-hash-mismatch");
    });

    it("still catches a broken content reference", () => {
      // This is the check that keeps working in CI without AWS credentials.
      const findings = reconcile({ manifest: [], local: [], s3: null, references: ["x.png"] });
      expect(codes(findings)).toContain("broken-reference");
    });

    it("treats a not-yet-pulled file as information, not a problem", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [],
        s3: null,
        references: ["a.png"],
      });
      expect(findings[0]).toMatchObject({ severity: OK, code: "missing-locally-offline" });
    });

    it("does not fail --strict just because nothing has been pulled", () => {
      // This is CI's normal state: manifest present, no bytes, no AWS. It must
      // pass, or the offline check is unusable exactly where it is needed.
      const findings = reconcile({
        manifest: [manifestEntry("a.png"), manifestEntry("b.png")],
        local: [],
        s3: null,
        references: ["a.png", "b.png"],
      });
      expect(shouldFail(findings, { strict: true })).toBe(false);
    });
  });

  describe("ordering", () => {
    it("puts errors before warnings", () => {
      const findings = reconcile({
        manifest: [manifestEntry("a.png")],
        local: [{ path: "zz-untracked.png", sha256: HASH_A }],
        s3: [],
        references: [],
      });
      expect(findings[0].severity).toBe(ERROR);
      expect(findings.at(-1)!.severity).toBe(WARN);
    });
  });
});

describe("shouldFail", () => {
  it("fails on any error", () => {
    expect(shouldFail([{ severity: ERROR }])).toBe(true);
  });

  it("passes with only warnings by default", () => {
    expect(shouldFail([{ severity: WARN }])).toBe(false);
  });

  it("fails on warnings under --strict", () => {
    expect(shouldFail([{ severity: WARN }], { strict: true })).toBe(true);
  });

  it("passes on an empty set", () => {
    expect(shouldFail([])).toBe(false);
    expect(shouldFail([], { strict: true })).toBe(false);
  });

  it("ignores ok findings", () => {
    expect(shouldFail([{ severity: OK }], { strict: true })).toBe(false);
  });
});

describe("against the recorded S3 listing", () => {
  // Real `list-objects-v2` shape, captured from the live bucket, so the key
  // parsing is exercised against what AWS actually returns.
  const listing = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../fixtures/media_s3_listing.json", import.meta.url)),
      "utf-8",
    ),
  );

  const s3 = listing.Contents.map((object: { Key: string }) => ({
    path: object.Key.replace(/^media\//, ""),
    sha256: null,
  }));

  it("strips the media/ prefix from real keys", () => {
    expect(s3.map((o: { path: string }) => o.path)).toEqual([
      "how-this-website-was-built.png",
      "orphan-left-in-bucket.png",
    ]);
  });

  it("reports the second object as an orphan", () => {
    const findings = reconcile({
      manifest: [manifestEntry("how-this-website-was-built.png")],
      local: [{ path: "how-this-website-was-built.png", sha256: HASH_A }],
      s3,
      references: ["how-this-website-was-built.png"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "orphan-in-s3",
      path: "orphan-left-in-bucket.png",
    });
  });

  it("tolerates objects with no sha256 metadata rather than erroring", () => {
    // Objects uploaded before media-push existed carry no sha256 metadata;
    // that is a gap to backfill, not a corruption to fail the build on.
    const findings = reconcile({
      manifest: [manifestEntry("how-this-website-was-built.png")],
      local: [],
      s3,
      references: ["how-this-website-was-built.png"],
    });
    expect(codes(findings)).not.toContain("s3-hash-mismatch");
    expect(findings.find((f) => f.action === "pull")).toBeDefined();
  });
});
