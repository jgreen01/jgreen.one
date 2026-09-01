# Managing images and other media

**Date:** 2026-08-30

**Author:** Jon Green

**Status:** published

**Summary:** How images, video and PDFs are stored, referenced and deployed —
they live in S3, not in git, and `media-manifest.json` is the record of what
exists.

## Scope

Covers every raster image, video and PDF the site serves. Does **not** cover
SVG: `src/assets/avatar.svg` and `public/favicon.svg` are text, they diff and
merge like source, and the build imports them directly — they stay in git.

## Why images are not in git

Git keeps every version of every binary forever. A single replaced screenshot
means both copies live in the repository permanently, and every future clone
pays for them. Text does not behave this way; binaries do.

So the bytes live in S3 (the same bucket that serves the site, which has
versioning enabled) and git keeps only a small JSON record of what exists.

## The three places an asset lives

| Where | What it is | In git? |
|---|---|---|
| `public/media/` | your local working copy, and the build input | **no** — git-ignored |
| `s3://<site-bucket>/media/` | the durable copy; bucket versioning is the history | n/a |
| `media-manifest.json` | the record: path, size, sha256, dimensions, what references it | **yes** |

Assets are served at `/media/<name>` — `public/` is copied verbatim into `dist/`,
so no code is involved.

## Adding an image to a post

1. Drop the file in `public/media/`. Use a descriptive, lowercase, ASCII name:
   `how-this-website-was-built.png`, not `Screenshot 2026-08-30 at 14.22.png`.
2. Upload it and refresh the record:
   ```bash
   npm run media:push
   ```
3. Reference it with a **site-absolute** path:
   ```yaml
   heroImage: "/media/how-this-website-was-built.png"
   ```
   or in the body:
   ```markdown
   ![A short description of what the image shows](/media/diagram.webp)
   ```
4. Commit your content change **and** `media-manifest.json`. The image itself is
   not in that commit — that is the point.

**Always write real alt text.** It is not in the manifest, because the right
words depend on where the image is used. Describe what the image conveys, not
that it is an image.

## After cloning the repo

A fresh clone has the manifest but no image bytes. One command fixes that:

```bash
npm run media:pull
```

`npm run dev` works without it — the pages render, the images 404.

## Commands

| Command | What it does |
|---|---|
| `npm run media:check` | Compares manifest ↔ `public/media/` ↔ S3. Needs AWS credentials. |
| `npm run media:pull` | Same, and downloads anything missing locally. |
| `npm run media:push` | Uploads `public/media/` to S3 and regenerates the manifest. |

Useful flags on `node scripts/media-check.mjs`:

- `--offline` — skip the S3 comparison entirely. Works with no AWS credentials.
- `--strict` — treat warnings as failures.
- `--regen` — rewrite the manifest from what is on disk.

## What the checker tells you

| Message | Severity | What to do |
|---|---|---|
| `missing-from-s3` | error | The durable copy is gone. Do not delete your local file — run `npm run media:push` to restore it. |
| `local-hash-mismatch` | error | Your local file differs from the manifest. If you edited it deliberately, `npm run media:push`. |
| `s3-hash-mismatch` | error | The bucket and the manifest disagree. Work out which is right before touching either. |
| `broken-reference` | error | A post points at an asset nobody manages. Fix the path, or add the file and push it. |
| `orphan-in-s3` | warn | Something in the bucket is not in the manifest — usually a leftover. |
| `untracked-local` | warn | You added a file and have not pushed it yet. |
| `unreferenced` | warn | Nothing points at this asset. A deletion candidate, once you are sure. |

Errors exit non-zero; warnings only print, unless you pass `--strict`.

## How this interacts with deploying

`scripts/deploy.sh` runs `media-check --pull` **before** the build. This order
matters: `public/media/` is git-ignored, so on a clean checkout the build would
emit no images, and the `aws s3 sync ./dist --delete` that follows would then
delete them from the bucket. The check runs first and fails loudly rather than
letting a deploy proceed unverified.

## Rules

- Raster images, video and PDF **always** go through `public/media/`.
- Small text SVG that is genuine site source stays in git. An oversized SVG
  (roughly >100 KB — a traced photo, say) goes through `public/media/` instead.
- `heroImage` must be `/media/...` or an external `https://` URL. The schema
  rejects anything else at build time, with a message telling you what to do.
- Never hand-edit `media-manifest.json` except the optional `source` field,
  which records where an asset came from and survives a regeneration.

## Troubleshooting

**`media-check: could not reach S3`** — you have no AWS credentials. Use
`--offline` to work without S3.

**`Could not determine the media bucket`** — the bucket name normally comes from
the `bucket` field in `media-manifest.json`, which every clone has. If that field
is missing (a manifest predating it), set `SITE_BUCKET=jgreen-one-site` or run
`npm run media:push` to regenerate the manifest.

**The build fails with a `heroImage` error** — the value is not `/media/...` or
an `https://` URL. That guard exists because a page-relative path silently 404s
on `/entries/<slug>/` while still looking like a rendered image.

**Images 404 in `npm run dev`** — you have not run `npm run media:pull`.

**CI does not verify the image bytes.** CI has no AWS credentials yet, so it
runs `media-check --offline` and checks that every referenced asset is *in the
manifest*, not that the file exists. Task 9 (GitHub OIDC role) would let CI run
the full check.

## Related

- `todo/6-image-asset-management.md` — why this design, and what was rejected
- `guides/adding-content.md` — writing an entry
- `guides/deploying.md` — the deploy flow
