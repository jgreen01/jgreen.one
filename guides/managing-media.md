# Managing media

**Date:** 2026-08-30

**Author:** Jon Green

**Status:** published

**Last reviewed:** 2026-09-01

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

## Adding a video

Video goes through `public/media/` exactly like an image, but three things will
bite you that never come up with a `.png`.

**1. Get the file, and insist on H.264.** If you are mirroring a recording:

```bash
yt-dlp -f "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/137+140" \
  --merge-output-format mp4 \
  -o "public/media/<slug>.%(ext)s" "https://www.youtube.com/watch?v=VIDEO_ID"
```

`vcodec^=avc1` is not optional. Ask only for `[ext=mp4]` and you can get an HLS
**VP9** stream, which YouTube also labels `mp4` — it plays in Chrome and Firefox
and fails silently in Safari. Requires `ffmpeg` on PATH for the merge.

**2. Verify what you actually got.**

```bash
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height \
  -show_entries format=duration -of default=noprint_wrappers=1 public/media/<slug>.mp4
```

Want `h264` + `aac`. If you see `vp9`, the selector fell through — redo step 1.

**3. Check the `moov` atom is at the front.** Otherwise the browser downloads the
entire file before playing a single frame, which on a 140 MB file means nothing
happens for a long time.

```bash
ffprobe -v trace -i public/media/<slug>.mp4 2>&1 | grep -m2 -E "type:'(moov|mdat)'"
```

`moov` must appear before `mdat`. If it does not, remux — this is a stream copy,
so it re-encodes nothing:

```bash
ffmpeg -i in.mp4 -c copy -movflags +faststart public/media/<slug>.mp4
```

**Then push and reference it as usual:**

```bash
npm run media:push
```

```yaml
mirrorUrl: "/media/<slug>.mp4"   # a talk transcript's self-hosted recording
```

or in a page, with a caption track where one exists:

```html
<video controls preload="metadata" src="/media/<slug>.mp4">
  <track kind="captions" src="/entries/<slug>/captions.vtt" srclang="en" label="English" default>
</video>
```

### What a video costs

Worth knowing before adding a second one.

- **Storage** is nothing: ~$0.02 per GB per month.
- **Egress is the real cost** — roughly $0.085/GB out of CloudFront. A 140 MB
  file is about **1.2p per full view**; a thousand views is about £10. Linear,
  and uncapped apart from the WAF rate limit and the billing alarms.
- **Cold deploys get slower.** `deploy.sh` runs `media-check --pull` before
  building, and `public/media/` is git-ignored — so a fresh checkout or a CI
  runner downloads every video before it can build.
- **There is no adaptive bitrate.** One file means a phone on a weak connection
  gets the full 1080p or nothing. Keep the original streaming link primary and
  treat the self-hosted copy as the durable fallback, not the better player.

For reference: a 48-minute screen-recorded talk is about 140 MB at 1080p.
Slides and terminal text compress far better than real footage, so do not size
your expectations from a camera video.

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

**A video plays in Chrome and Firefox but not Safari** — it is VP9 in an MP4
container. YouTube labels that stream `mp4`, so a selector asking only for
`[ext=mp4]` will happily pick it. Re-pull with `vcodec^=avc1` and confirm with
`ffprobe` that the codec is `h264`.

**A video takes a long time to start** — the `moov` atom is at the end of the
file, so the browser must fetch all of it first. Remux with
`-movflags +faststart`.

**`yt-dlp` leaves `.f137.mp4` and `.f140.m4a` behind and no merged file** —
`ffmpeg` is not on PATH, so the merge step was skipped. It warns, but the
message is easy to miss in the download output. Install `ffmpeg` and re-run.
Do not delete the two parts until you have confirmed the merged file exists.

**Deploys got much slower** — `deploy.sh` pulls managed media before building,
and a video is three orders of magnitude larger than the images. Expected on a
cold checkout; on your own machine the file is already there.

## Related

- `todo/6-image-asset-management.md` — why this design, and what was rejected
- `guides/adding-content.md` — writing an entry
- `guides/deploying.md` — the deploy flow
