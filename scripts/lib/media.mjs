/**
 * Pure helpers behind `media-check` and `media-push`.
 *
 * Kept free of filesystem and AWS access so the reconciliation rules can be
 * unit-tested against plain arrays. The CLI wrappers do the I/O and hand the
 * results in here.
 */
import { createHash } from "node:crypto";

/**
 * @typedef {object} ManifestEntry
 * @property {string} path            path relative to public/media/
 * @property {number} bytes
 * @property {string} sha256
 * @property {number|null} [width]    null for non-raster assets
 * @property {number|null} [height]
 * @property {string} [contentType]
 * @property {string} [addedAt]       ISO date the asset entered the repo
 * @property {string} [source]        hand-written; preserved across regeneration
 * @property {string[]} [referencedBy]
 */

/**
 * @typedef {object} LocalAsset
 * @property {string} path
 * @property {number} [bytes]
 * @property {string} sha256
 * @property {number|null} [width]
 * @property {number|null} [height]
 * @property {string} [addedAt]
 */

/**
 * @typedef {object} S3Asset
 * @property {string} path
 * @property {string|null} sha256   null when the object carries no metadata
 */

/**
 * @typedef {object} Finding
 * @property {string} severity      one of ERROR, WARN, OK
 * @property {string} code
 * @property {string} path
 * @property {string} message
 * @property {string|null} action   "pull" when it is safe to fetch automatically
 */

/** Severity ordering: errors fail the run, warnings only report. */
export const ERROR = "error";
export const WARN = "warn";
export const OK = "ok";

/** Extensions the media workflow manages. */
export const MANAGED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".mp4",
  ".webm",
  ".pdf",
];

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

/** sha256 of a buffer, lowercase hex. */
export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Content type for a managed asset path, or a safe default. */
export function contentTypeFor(path) {
  const dot = path.lastIndexOf(".");
  const ext = dot === -1 ? "" : path.slice(dot).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function isManagedAsset(path) {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return MANAGED_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

/**
 * Finds every `/media/<path>` reference in a blob of content.
 *
 * Covers frontmatter (`heroImage: "/media/x.png"`) and Markdown bodies
 * (`![alt](/media/x.png)`) alike — both are just text containing the path.
 */
export function findMediaReferences(text) {
  const found = new Set();
  for (const [, path] of text.matchAll(/\/media\/([A-Za-z0-9._\-/]+)/g)) {
    found.add(path);
  }
  return [...found];
}

/**
 * Builds a manifest from the local files, carrying forward the one field a
 * human maintains by hand.
 *
 * @param {LocalAsset[]} files
 * @param {object} [options]
 * @param {ManifestEntry[]} [options.previous] the existing manifest, for
 *   preserving `source` and the original `addedAt`
 * @param {Record<string, string[]>} [options.referencesByPath] from the content scan
 * @returns {ManifestEntry[]}
 */
export function buildManifest(files, { previous = [], referencesByPath = {} } = {}) {
  const priorByPath = new Map(previous.map((entry) => [entry.path, entry]));

  return files
    .map((file) => {
      const prior = priorByPath.get(file.path);
      const entry = {
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        width: file.width ?? null,
        height: file.height ?? null,
        contentType: contentTypeFor(file.path),
        // Keep the original date: this records when the asset entered the
        // repo, not when the manifest was last regenerated.
        addedAt: prior?.addedAt ?? file.addedAt,
        referencedBy: (referencesByPath[file.path] ?? []).slice().sort(),
      };
      // `source` is the one hand-written field; only carry it if it exists.
      if (prior?.source) entry.source = prior.source;
      return entry;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

const finding = (severity, code, path, message, action = null) => ({
  severity,
  code,
  path,
  message,
  action,
});

/**
 * Compares the three views of the asset set and returns what disagrees.
 *
 * @param {object} views
 * @param {ManifestEntry[]} [views.manifest] committed manifest entries
 * @param {LocalAsset[]} [views.local] found under `public/media/`
 * @param {S3Asset[]|null} [views.s3] from the bucket, or `null` in offline mode
 * @param {string[]} [views.references] asset paths referenced by content or code
 * @returns {Finding[]} findings, most severe first
 */
export function reconcile({ manifest = [], local = [], s3 = null, references = [] }) {
  const findings = [];
  const manifestByPath = new Map(manifest.map((entry) => [entry.path, entry]));
  const localByPath = new Map(local.map((file) => [file.path, file]));
  const s3ByPath = s3 === null ? null : new Map(s3.map((object) => [object.path, object]));

  for (const entry of manifest) {
    const localFile = localByPath.get(entry.path);
    const s3Object = s3ByPath?.get(entry.path);

    if (s3ByPath && !s3Object) {
      findings.push(
        finding(
          ERROR,
          "missing-from-s3",
          entry.path,
          "listed in the manifest but absent from S3 — the durable copy is gone",
        ),
      );
    } else if (s3Object && s3Object.sha256 && s3Object.sha256 !== entry.sha256) {
      findings.push(
        finding(
          ERROR,
          "s3-hash-mismatch",
          entry.path,
          "the object in S3 does not match the manifest hash",
        ),
      );
    }

    if (localFile && localFile.sha256 !== entry.sha256) {
      findings.push(
        finding(
          ERROR,
          "local-hash-mismatch",
          entry.path,
          "the local file differs from the manifest — edited but not pushed?",
        ),
      );
    }

    // Only offer to pull when S3 genuinely holds the manifest's version.
    if (!localFile && s3Object && (!s3Object.sha256 || s3Object.sha256 === entry.sha256)) {
      findings.push(
        finding(OK, "missing-locally", entry.path, "not present locally", "pull"),
      );
    } else if (!localFile && !s3ByPath) {
      // Informational, not a warning. Offline mode cannot tell whether the
      // asset exists in S3, and a checkout that has not pulled yet is the
      // normal state — for CI it is the *only* state. Making this a warning
      // meant `--offline --strict` failed on a perfectly healthy repository.
      findings.push(
        finding(
          OK,
          "missing-locally-offline",
          entry.path,
          "not present locally; run `npm run media:pull` to fetch it",
        ),
      );
    }

    if (!entry.referencedBy || entry.referencedBy.length === 0) {
      findings.push(
        finding(WARN, "unreferenced", entry.path, "no content references this asset"),
      );
    }
  }

  for (const file of local) {
    if (!manifestByPath.has(file.path)) {
      findings.push(
        finding(
          WARN,
          "untracked-local",
          file.path,
          "present locally but not in the manifest — run `npm run media:push`",
        ),
      );
    }
  }

  if (s3ByPath) {
    for (const object of s3) {
      if (!manifestByPath.has(object.path)) {
        findings.push(
          finding(WARN, "orphan-in-s3", object.path, "in the bucket but not in the manifest"),
        );
      }
    }
  }

  for (const path of references) {
    if (!manifestByPath.has(path)) {
      findings.push(
        finding(
          ERROR,
          "broken-reference",
          path,
          "referenced by content but not in the manifest — broken image",
        ),
      );
    }
  }

  const rank = { [ERROR]: 0, [WARN]: 1, [OK]: 2 };
  return findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path),
  );
}

/**
 * Whether a set of findings should fail the run.
 *
 * @param {Array<{ severity: string }>} findings
 * @param {object} [options]
 * @param {boolean} [options.strict] treat warnings as failures too
 * @returns {boolean}
 */
export function shouldFail(findings, { strict = false } = {}) {
  return findings.some(
    (f) => f.severity === ERROR || (strict && f.severity === WARN),
  );
}
