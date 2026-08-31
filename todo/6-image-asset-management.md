# Image / Binary Asset Management (keep images out of git)

**Priority**: MEDIUM
**Status**: TODO
**Created**: 2026-08-27
**Updated**: 2026-08-30

**Decision**: Option A, variant **A1**. One git-ignored folder `public/media/` holds all
managed raster/video/PDF assets; it doubles as the local working copy and is staged into
the build (it already lives under `public/`, so `astro build` copies it into `dist/`
untouched). The existing site S3 bucket (`media/` key prefix) is the durable copy — its
versioning is the "never lose it" guarantee. A root `media-manifest.json` (committed,
machine-generated) is the inventory. A `media-check` script reconciles manifest ↔ local
↔ S3. SVGs and other small text/vector source stay committed. Final step: purge the
already-committed image blobs from git history.

Folder name `public/media/` is the working assumption — swap for `public/img/` or
`public/uploads/` if preferred before implementation starts.

## Description

Images (hero images, screenshots, diagrams, future photo content) should **not** be
committed into the git repo — git keeps every version of every binary forever, so the
repo only grows. But they still need a durable, tracked home so they are versioned and
never lost.

Today images live committed under `public/entries/images/` and `src/assets/`. It's tiny
now (5 files, ~200 KB, `.git` is 5.1 MB) so this is cheap to fix **now**, before a
photo-heavy post makes a history rewrite painful.

## How it works (plain summary)

- All managed assets live in **one folder: `public/media/`**, git-ignored.
- They are served at `/media/...` — e.g. `public/media/how-this-website-was-built.png`
  → `https://jgreen.one/media/how-this-website-was-built.png`.
- The **durable copy** is the site S3 bucket under the `media/` key prefix. Bucket
  versioning (already enabled) keeps history.
- **`media-manifest.json`** at the repo root **is committed**. It's a machine-generated
  inventory — path, size, sha256, dimensions, content-type, date added, and which
  entries reference each file. A few KB of text. This is how git still "knows" the
  images exist without storing them.
- **`media-check`** compares the three views (manifest ↔ `public/media/` ↔ S3). It
  auto-pulls files that are simply missing locally; anything else inconsistent is a
  loud failure for a human to resolve.
- **Build/deploy**: `scripts/deploy.sh` runs `media-check` (full mode, which pulls
  missing files) *before* `npm run build`. The build then copies `public/media/` into
  `dist/` like any other static file, and the existing `aws s3 sync ./dist --delete`
  ships it. No `--exclude`, no separate sync step needed.
- **Fresh clone**: `git clone` gives you code + manifest but no images. Run
  `media-check --pull` (or `npm run media:pull`) once and it downloads them from S3.
- **Adding an image**: drop it in `public/media/`, run `media-push` (uploads + updates
  the manifest), reference it as `/media/<name>` in frontmatter or Markdown, commit the
  post + the manifest change. The image itself is never in the commit.

## Current constraints (context for the design)

1. **Astro copies `public/` verbatim into `dist/`.** So `public/media/` needs to exist
   at build time. `media-check` populating it before the build satisfies this.
2. **`scripts/deploy.sh` runs `aws s3 sync ./dist "s3://$BUCKET/" --delete`.** Anything
   in the bucket not produced by the build gets deleted. Because `public/media/` is
   staged into the build, the images are always in `dist/`, so `--delete` never touches
   them — **no `--exclude` required.** The one hazard: if a clean CI checkout builds
   *without* first running `media-check`/pull, the build emits no images and the sync
   deletes them from S3. Mitigate by making `media-check` the first thing `deploy.sh`
   does and having it hard-fail if it can't reach S3.
3. **`heroImage` frontmatter** (`src/content/schema.ts` since task 4 — no longer
   `config.ts`) is still loosely specified ("Path in /public or external image URL").
   Task 4 removed the *inconsistency* (the dangling `/images/placeholder-project.png`
   is gone and both call sites share `heroImagePath()`), but the schema still accepts
   three shapes. This task pins it to **exactly one**: a site-absolute `/media/...`
   path or an external `https://` URL. See "Content & component changes" below.
4. **Astro image optimization** (responsive `srcset`, webp/avif) only runs on images
   imported through `src/assets/` at build time. `/media/` images are served
   unoptimized. Accept that for now; a future `media-push` step could generate webp +
   widths. Out of scope for this task.
5. Solo maintainer, AWS account already in use (575352938041), site + state buckets
   already private w/ OAC + versioning. No second cloud vendor, no heavy toolchain.

## Options researched (kept for reference — Option A chosen)

| Option | How it works | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Same site bucket** ✅ **CHOSEN (A1)** | Git-ignored `public/media/` = working copy + build input. `media-check`/`media-pull` hydrates it from `s3://$BUCKET/media/` before build; `media-push` uploads + refreshes the manifest. Bucket versioning = history. **A2 alt (rejected):** keep images out of the build, serve from a bucket prefix, `--exclude "media/*"` on deploy's `--delete`. | Minimal infra. No new bucket/behavior/DNS/vendor. No deploy `--exclude`. One folder, one `.gitignore` line, one enforceable rule. Free. | Images re-upload with each deploy (trivial at blog scale). No content-addressed dedup. | **Chosen** |
| **B. Dedicated versioned S3 media bucket + CloudFront `/media/*` behavior (OAC)** | New private bucket, cache behavior on the existing distribution via OAC. | Clean lifecycle separation. Same distribution, no new DNS/cert. | More Terraform (bucket + OAC + behavior + policy). | Overkill now; revisit if media needs its own retention/lifecycle |
| **C. Cloudflare R2** | Upload to R2, serve via custom domain. | 10 GB free, **$0 egress at any volume**. S3-compatible API. | Second cloud vendor + account + tokens. Splits infra. | Reconsider only if bandwidth ever gets expensive |
| **D. DVC with S3 remote** | `dvc add` writes committed `*.dvc` pointers; blobs to an S3 remote; `dvc pull` on clone. Content-addressed, dedup. | Purpose-built for "track big files, not in git". Real version checkout. | Python tool dep. Still needs `dvc pull` into `public/` before build. Another tool to run solo. | Good if we want rigorous versioning later; heavier than warranted |
| **E. Git LFS** | Pointers in git, blobs on GitHub's LFS server. | `git`-native. | Still puts pointers + a hook in the repo. GitHub LFS is now **metered billing** (~$0.07/GiB-mo storage, ~$0.0875/GiB bandwidth) past 10 GB free; CI clones multiply cost. | **Not recommended** |
| **F. Third-party image CDN/DAM** (Cloudinary, imgix, Bunny) | Service stores originals + does transforms/delivery. | On-the-fly resize/format. | New vendor, billing, lock-in. Astro covers most transform needs already. | **Not recommended** for a personal site |

## Design

### Folder & serving

- **`public/media/`** — single folder, git-ignored (`/public/media/` in `.gitignore`),
  is both the local working copy and the build input. Flat layout is fine at current
  scale (`public/media/<name>.<ext>`); allow `public/media/<slug>/...` subfolders later
  if a post needs many images.
- Served at `/media/<name>` with no code involved — it's just a static file under
  `public/`.

### S3 layout

- Durable copy: `s3://$BUCKET/media/<name>` (move the existing object from its current
  `entries/images/` key). Same bucket as the site, versioning already on.
- `media-push` sets the file's **sha256 as S3 object metadata** (`--metadata sha256=<hex>`)
  so `media-check` can compare hashes regardless of multipart-upload ETag behavior.

### Manifest — `media-manifest.json` at repo root, committed, machine-generated

- Not hand-edited. `media-push` (and a `--regen` flag on `media-check`) rewrite it from
  the actual files. `git diff` on it then reads as a clean "what asset changed when" log.
- One entry per asset:
  ```json
  {
    "path": "how-this-website-was-built.png",
    "bytes": 123456,
    "sha256": "…",
    "width": 1536,
    "height": 1024,
    "contentType": "image/png",
    "addedAt": "2026-08-27",
    "source": "generated (Gemini)",            // optional, human-set once, preserved on regen
    "referencedBy": ["entries/how-this-site-was-made"]  // computed by scanning src/content/
  }
  ```
- **No alt text in the manifest** — alt text depends on where an image is used, so it
  belongs in the `<img alt>` / content, not a global list.
- `referencedBy` is computed by grepping `src/content/` for `/media/<path>` (frontmatter
  and Markdown body). Enables "unreferenced asset" warnings.
- Dimensions via a pure-JS lib (`image-size`), sha256 via Node `crypto`. Both
  hermetically testable with fixtures.

### `scripts/media-check.mjs` — the reconciler

Compares three views: **manifest** (git), **local** (`public/media/`), **S3**
(`s3://$BUCKET/media/`).

| Situation | Severity | Action |
|---|---|---|
| In manifest, missing locally, in S3, sha256 matches manifest | ok | **auto-pull** (normal fresh-clone / CI case) |
| In manifest, **missing from S3** | **error** | durable copy gone — data-loss risk; exit non-zero |
| Local file sha256 ≠ manifest | **error** | image edited but not pushed, or corruption; never auto-overwrite |
| Manifest sha256 ≠ S3 object metadata sha256 | **error** | bucket and manifest disagree; human decides |
| In S3, not in manifest | **warn** | orphan in bucket — someone forgot `media-push --regen`, or it's stale |
| Local, not in manifest | **warn** | added a file, forgot `media-push` |
| In manifest, `referencedBy` empty | **warn** | unreferenced asset — deletion candidate |
| Referenced in content but not in manifest | **error** | broken image reference; exit non-zero |

- **Two modes:**
  - `--offline` — manifest ↔ local only, no AWS calls. For a pre-commit hook and
    working without credentials.
  - default (full) — also lists S3 and compares. Needs AWS creds. Hard-fails if it
    can't reach S3 (so a deploy never silently proceeds without verification).
- **`--pull`** — perform the safe auto-pull action (first row). Without it, report-only.
- **`--regen`** — rewrite `media-manifest.json` from local files (used by `media-push`).
- Exit non-zero on any **error**-severity finding; warnings print but don't fail unless
  `--strict`.

### Scripts & wiring

- `scripts/media-check.mjs` — above.
- `scripts/media-push.sh` (or `.mjs`) — `aws s3 sync ./public/media/ s3://$BUCKET/media/`
  (no `--delete`), set `sha256` metadata per object, then `media-check --regen` to
  refresh the manifest. Prints what changed.
- `npm` scripts: `"media:check"`, `"media:pull"` (`media-check --pull`), `"media:push"`.
- `scripts/deploy.sh` — add **one line** near the top, before `npm run build`:
  `node scripts/media-check.mjs --pull` (full mode; hard-fails if S3 unreachable or any
  error finding). The existing `aws s3 sync ./dist ... --delete` line is untouched.
- `.githooks/pre-commit` (optional, if wired) — `media-check --offline --strict` so you
  can't commit a post that references a missing/untracked image, and can't commit with a
  stale manifest.
- `.gitignore` — add `/public/media/`. Also defensively ignore raster extensions
  elsewhere under `public/` (`public/**/*.png` etc., with `!public/favicon.svg` style
  negations as needed) so a stray `git add` can't recommit a binary.

### Content & component changes (the one-time "move")

> **Superseded by task 4 (done 2026-08-30).** Three items originally planned here have
> already shipped, and the component layer no longer looks the way this task assumed.
> What changed:
>
> - **The `ArticleLayout` 404 bug is fixed.** It no longer "fixes itself as a side
>   effect" of this task — it was fixed directly, along with two related path bugs
>   (an external `https://` hero became `/entries/https://…`; an absolute path produced
>   a doubled slash in `og:image`).
> - **`EntryCard`'s inline prefix block is gone.** Both `EntryCard.astro` and
>   `ArticleLayout.astro` now call the shared **`heroImagePath()`** helper in
>   `src/utils/heroImagePath.ts`. There is no per-component logic left to strip.
> - **`sample-project.md`'s dead `heroImage` line is already removed** (it pointed at a
>   file that never existed; the build-integration test caught it).
> - **The Zod schema moved** out of `src/content/config.ts` into
>   `src/content/schema.ts`, which imports `astro/zod` and is unit-tested in
>   `tests/unit/schema.test.ts`. `config.ts` is now a four-line wrapper.
>
> So this task's job shrinks: change the **convention** in one helper and one schema,
> then update the tests that encode the old convention.

Pin `heroImage` to a single format: **site-absolute `/media/...` or external `https://`**.

| File | Change |
|---|---|
| `src/content/schema.ts` | `heroImage` `.describe()` → "Site-absolute `/media/...` path or external https URL". Optionally `.refine(v => v.startsWith('/media/') || /^https?:\/\//.test(v))` so a bad value fails the build. **Not** `config.ts` — the schema lives here now. |
| `src/utils/heroImagePath.ts` | Decide what the collection-relative fallback should do once every value is absolute. Either keep it as a safety net, or drop the `` `/${collection}/${value}` `` branch and let the schema `.refine()` reject anything non-absolute. Dropping it simplifies the helper to "trim, return, or undefined". |
| `src/content/entries/how-this-site-was-made.md` | `heroImage: "images/how-this-website-was-built.png"` → `heroImage: "/media/how-this-website-was-built.png"` |
| ~~`src/content/entries/sample-project.md`~~ | ✅ already done (task 4) |
| ~~`src/components/EntryCard.astro`~~ | ✅ already done (task 4) — calls `heroImagePath()` |
| ~~`src/layouts/ArticleLayout.astro`~~ | ✅ already done (task 4) — calls `heroImagePath()`, bug fixed |
| in-body Markdown images (none today) | convention: `![alt](/media/<name>)` |

### Hero-image optimization

Out of scope. Accept unoptimized `/media/` delivery for now. A later iteration can have
`media-push` generate webp + a couple of widths alongside originals and record them in
the manifest.

## ⚠️ Blocker to solve first: gitignored media breaks CI

`public/media/` being git-ignored means **a fresh CI checkout has no images at all.**
Three tests added by task 4 will then fail:

| Test | Why it breaks |
|---|---|
| `tests/integration/build.test.mjs` — "every referenced local image exists in dist" | `heroImage: "/media/…"` is referenced but the file was never checked out |
| `tests/e2e/site.spec.ts` — "shows the hero image at a non-zero size" | `naturalWidth` is 0 for a missing image |
| `tests/e2e/site.spec.ts` — "requests the hero image from an absolute path that actually resolves" | asserts no image response ≥ 400 |

CI has **no AWS credentials today**, so `media-check --pull` cannot run there. Pick one
before writing any code — this decision shapes the whole task:

- **(a) Give CI read-only S3 credentials.** Same GitHub OIDC provider + IAM role the
  `infra` CI job already needs (see `.github/workflows/ci.yml`, currently inert). Most
  faithful — CI builds exactly what deploys — and does double duty. Costs the Terraform
  for an OIDC provider and role.
- **(b) Make the image assertions conditional.** Skip them when `public/media/` is empty,
  and keep them mandatory in `deploy.sh`. Cheap, but CI stops catching broken image
  references — which is precisely the bug class task 4 just found.
- **(c) Commit one small placeholder** at `public/media/` and gitignore the rest. Keeps
  CI honest about the *mechanism* without holding real assets, but reintroduces a binary
  into git, which is the thing this task exists to stop.

**Recommendation: (a)** — now filed as **[task 9](9-github-oidc-ci-role.md)**, which
Terraforms the OIDC provider and a read-only role. Its permission list already includes
`s3:ListBucket` / `s3:GetObject` on `jgreen-one-site` and `/media/*` for exactly this.
**Do task 9 first**, then decide here whether to reuse that role or give media its own.

## Implementation steps (in order)

0. [ ] **Resolve the CI blocker above.** Nothing else is safe to start until this is
       settled — it decides whether `media-check --pull` runs in CI.
1. [ ] Confirm folder name (`public/media/` default). Add `/public/media/` to `.gitignore`
       plus defensive raster-extension ignores under `public/`.
2. [ ] Create `public/media/`; move `how-this-website-was-built.png` into it.
       `git rm --cached public/entries/images/how-this-website-was-built.png` (working
       tree keeps the file at its new path).
3. [ ] `src/content/schema.ts` (**not** `config.ts`): tighten the `heroImage` describe +
       optional `.refine`. Update `tests/unit/schema.test.ts` to cover the new rule —
       a `/media/…` value passes, a bare `images/…` value is rejected.
4. [ ] Content edit: `how-this-site-was-made.md` heroImage → `/media/...`.
       (`sample-project.md` already has no heroImage.)
5. [ ] `src/utils/heroImagePath.ts`: decide whether to keep or drop the
       collection-relative branch (see table above). **Rewrite
       `tests/unit/heroImagePath.test.ts` to match** — it currently asserts the old
       `/entries/` prefixing behaviour in six tests, which is the convention being
       replaced. Keep the external-URL and empty-value cases; they still hold.
6. [ ] Write `scripts/media-check.mjs` (reconciler, both modes, table above) +
       `scripts/media-push.sh`. Add `media:check` / `media:pull` / `media:push` npm
       scripts. `image-size` as a dev dep for dimensions.
7. [ ] Define + generate `media-manifest.json` at repo root; commit it. Verify
       `referencedBy` picks up `how-this-site-was-made`.
8. [ ] `media-push` the image to `s3://$BUCKET/media/how-this-website-was-built.png`
       with `sha256` metadata; confirm it's in S3 and versioning is on. Remove the old
       `entries/images/` object.
9. [ ] `scripts/deploy.sh`: add `node scripts/media-check.mjs --pull` before
       `npm run build`. Verify with `aws s3 sync --dryrun` (after a build) that no
       `media/` object is marked for deletion.
10. [ ] Update `tests/unit/deployScript.test.ts` — it asserts the **exact** argument
        list and call order for `terraform`/`aws`/`npm`. Adding a `media-check` call
        before the build changes that order, so the test will fail until updated.
        Add an assertion that `media-check` runs **before** `npm run build`.
11. [ ] Guide under `guides/`: "How to add / manage images" — folder, `media-push`,
        `/media/` reference convention, alt-text requirement, the SVG rule, the
        fresh-clone flow (`git clone` → `npm run media:pull` → `npm run dev`).
12. [ ] **Testing** — see the section below. All five suites green before the purge.
13. [ ] **FINAL STEP — purge image blobs from git history.** See below. Only after
        0–12 are done, verified, and committed.

## Testing

The stack from task 4 is installed; use it rather than inventing a new one. See
`AGENTS.md` for the full contract — the short version: **`.astro` files cannot be unit
tested**, so all new logic goes in a plain module under `src/utils/` or `scripts/`, and
the component stays a thin wrapper.

### New tests to write (TDD — failing test first)

- **`media-manifest.json` generator** — given a fixture directory of files, produces the
  expected entries (path, bytes, sha256, dimensions, contentType). Use recorded fixtures
  under `tests/fixtures/`, never live `public/media/`.
- **`media-check` reconciliation logic** — the full severity table above, one test per
  row. Feed it three plain arrays (manifest / local / S3 listing) through a thin shim so
  no AWS call happens. Capture one real `aws s3api list-objects-v2` response into
  `tests/fixtures/media_s3_listing.json` and drive the S3 side from that.
- **`media-check` exit codes** — non-zero on any error-severity finding, zero with only
  warnings, and `--strict` promoting warnings to failures.
- **`media-push` argument construction** — mock `aws` on `PATH` exactly as
  `tests/unit/deployScript.test.ts` does; assert the exact argv, assert `--delete` is
  never passed, assert the `sha256` metadata flag is set, and assert no credential value
  appears in any command string.
- **Offline mode makes no AWS calls** — run `media-check --offline` with a stub `aws`
  that fails loudly if invoked.

### Existing tests this task will break (update them deliberately)

| File | Why |
|---|---|
| `tests/unit/heroImagePath.test.ts` | six tests assert `/entries/` prefixing — the convention being replaced |
| `tests/unit/schema.test.ts` | asserts `heroImage` is `"images/how-this-website-was-built.png"` |
| `tests/fixtures/frontmatter.ts` | same value in the fixture |
| `tests/unit/deployScript.test.ts` | exact argv + call order, changed by the new `media-check` step |
| `tests/integration/build.test.mjs` | image-existence assertion, per the CI blocker above |
| `tests/e2e/site.spec.ts` | `ENTRY_WITH_HERO` hero assertions |

A red test here means "the convention changed", not "something broke" — but change them
one at a time and read each failure, rather than bulk-editing until green.

### Verification before the history purge

```bash
npm run check        # 0 errors
npm test             # unit — all green
npm run test:build   # dist/ shape, image references resolve
npm run test:e2e     # hero renders on card, article and og:image
pytest tests/infra   # S3 versioning still on — it is the durable copy
./scripts/deploy.sh  # then load the live URLs
```

`pytest tests/infra` matters more than usual here: its
`test_versioning_is_enabled` is what guarantees the S3 bucket can actually recover a
deleted asset, which is this task's entire "don't lose it" claim.

## FINAL STEP (do LAST) — purge committed image blobs from git history

**Do not start until steps 1–12 are complete, verified, and committed**, and the images
are confirmed in S3 (with versioning) and serving correctly from `/media/`. This
rewrites history and force-pushes — one shot.

**Target blob(s) to remove from all history:**

- `public/entries/images/how-this-website-was-built.png` — the file Jon called out
  (hero for `how-this-site-was-made.md`). After step 2 it also has history under its old
  path even though the working copy moved.
- `samples/colors.png`, `samples/design.png` — decide first whether `samples/` stays at
  all; if kept, gitignore it; either way purge these from history here.

Re-scan for anything added since:

```bash
git rev-list --all --objects | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(rest)' | \
  awk '/^blob/ {print $3}' | grep -iE '\.(png|jpe?g|gif|webp|avif|tiff?|bmp)$' | sort -u
```

**Procedure:**

1. Working tree clean; everything from steps 1–12 committed and pushed.
2. Image confirmed retrievable from S3 and rendering on the live site from `/media/`.
3. Backup: `git clone --mirror` the repo somewhere safe before rewriting.
4. Rewrite with `git filter-repo` (preferred):
   ```bash
   git filter-repo \
     --path public/entries/images/how-this-website-was-built.png \
     --path samples/colors.png --path samples/design.png \
     --invert-paths
   # add any other blobs found by the scan above
   ```
   (BFG fallback: `bfg --delete-files '{how-this-website-was-built.png,colors.png,design.png}'`.)
5. `git reflog expire --expire=now --all && git gc --prune=now --aggressive`; confirm
   `.git` shrank and `git log --all --oneline -- <path>` returns nothing for each.
6. `git push --force --all && git push --force --tags`.
7. Update anything that pins a commit SHA (deploy/CI). Solo repo — the force-push blast
   radius is just Jon's other clones; re-clone them.
8. Re-clone fresh elsewhere, run `npm run media:pull` + `npm run build` to prove the new
   flow stands alone with the blobs gone from history.

## Notes

- Keep this proportionate. Personal blog, not a DAM. The win is "history stays small
  forever" — don't over-build.
- **SVGs stay committed (decided).** `src/assets/avatar.svg`, `public/favicon.svg`, and
  future small vector assets are *text* — they diff/merge/pack in git like source and
  don't bloat history the way raster blobs do. Both are build inputs (Astro
  `src/assets/` pipeline / `astro-favicons`); routing them through `public/media/` would
  make the build depend on `media-check` just to emit a favicon.
  **Guide rule:** raster (`.png .jpg .jpeg .webp .gif .avif`), video, PDF → always
  `public/media/`. Text SVG that is site source → committed. Oversized SVG (rough cutoff
  **>100 KB**, e.g. a traced photo) → `public/media/` too.
- `src/content/entries/how-this-site-was-made.md` body contains a code sample showing
  the old `heroImage` schema — cosmetic, update the prose if convenient when editing.

### Research sources

- GitHub Git LFS billing (metered, 2026): <https://docs.github.com/billing/managing-billing-for-git-large-file-storage/about-billing-for-git-large-file-storage>
- StorageBites — Git LFS pricing after data packs: <https://storagebites.com/git-lfs>
- Codemzy — hosting images for a static site without bloating git: <https://www.codemzy.com/blog/hosting-image-files-without-bloating-git>
- DVC + Amazon S3 remote (official docs): <https://doc.dvc.org/user-guide/data-management/remote-storage/amazon-s3>
- DVC get started: <https://doc.dvc.org/start>
- Cloudflare R2 free tier / $0 egress (2026): <https://egresscost.com/cloudflare/>

## Log

- 2026-08-27 Created. Researched options (Git LFS, dedicated S3 bucket, R2, DVC, image
  CDN, same-bucket prefix), with a committed text manifest + pull/push scripts.
- 2026-08-27 Jon chose **Option A**; also decided to purge committed image blobs from
  git history as the explicit FINAL step, targeting
  `public/entries/images/how-this-website-was-built.png` first.
- 2026-08-27 Traced the render path; settled on **variant A1** (stage into build, no
  deploy `--exclude`). Found a pre-existing bug: `ArticleLayout.astro:19` uses a
  relative `heroImage` path (in-article hero 404s).
- 2026-08-27 Refined the design with Jon: **single git-ignored folder `public/media/`**
  (no separate source dir — it is both working copy and build input); **manifest moved
  to repo root** (`media-manifest.json`), machine-generated inventory only (no alt
  text); added **`media-check` reconciler** (manifest ↔ local ↔ S3, offline + full
  modes, auto-pulls only exact-match-missing files, errors on every other
  inconsistency, sha256 stored as S3 object metadata). `heroImage` pinned to a single
  `/media/...`-or-`https://` format — one-time edits to 2 content files + 2 components +
  the schema; the `ArticleLayout` bug fixes itself via that convention change. SVGs
  stay committed. Not started.
- 2026-08-30 **Revised after task 4 landed.** Three planned edits already shipped there
  and are struck through above: the `ArticleLayout` 404 was fixed directly (not "as a
  side effect"), `EntryCard`'s inline prefix block is gone — both call the shared
  `src/utils/heroImagePath.ts` — and `sample-project.md`'s dead `heroImage` is removed.
  The Zod schema moved to `src/content/schema.ts`, so the `.describe()`/`.refine()`
  edit goes there. Added a **Testing** section (new tests to write, the six existing
  test files this task will break, and the pre-purge verification commands) and a new
  **step 0**: gitignoring `public/media/` leaves a CI checkout with no images, which
  fails three of task 4's tests. That has to be resolved first — recommended fix is
  giving CI read-only S3 access via the same GitHub OIDC role the inert `infra` CI job
  already needs. Still not started.
